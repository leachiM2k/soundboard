import { getMicrophoneStream, startRecording } from './audio/recorder';
import { ensureAudioContextRunning, playBlob, stopTile, clearAudioCache } from './audio/player';
import { loadAllSlots, saveSlot, loadSlot, deleteSlot, SlotIndex, requestStoragePersistence } from './storage/db';
import { createAppState, transitionTile, AppState } from './state/store';
import { initGrid, updateTile, updateAllTiles } from './ui/grid';
import { triggerHaptic } from './ui/haptic';
import { showActionSheet } from './ui/action-sheet';
import { showRenameDialog } from './ui/rename-dialog';
import { showInstallBanner } from './ui/install-banner';
import { acquireWakeLock, releaseWakeLock } from './audio/wake-lock';

const appState: AppState = createAppState();

// Install banner: shown once per day after first user interaction, never in standalone
let _bannerShown = false;
function triggerInstallBannerOnce(): void {
  if (_bannerShown) return;
  _bannerShown = true;
  // Small delay so the tile tap animation completes first
  setTimeout(() => showInstallBanner(), 800);
}

// ------- Recording timer -------

let _recordingTimer: ReturnType<typeof setInterval> | null = null;

function startRecordingTimer(index: number): () => void {
  const startTime = Date.now();
  const MAX_SECONDS = 30;
  _recordingTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, MAX_SECONDS - elapsed);
    const elapsedEl = document.getElementById(`timer-elapsed-${index}`);
    const remainingEl = document.getElementById(`timer-remaining-${index}`);
    if (elapsedEl) elapsedEl.textContent = formatTimerDisplay(elapsed);
    if (remainingEl) remainingEl.textContent = `0:${String(remaining).padStart(2, '0')}`;
  }, 200);

  return () => {
    if (_recordingTimer !== null) {
      clearInterval(_recordingTimer);
      _recordingTimer = null;
    }
  };
}

function formatTimerDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ------- Tile tap handler -------

async function handleTileTap(index: SlotIndex): Promise<void> {
  // CRITICAL: triggerHaptic MUST be called before any await — iOS requires user gesture
  // to be synchronous; awaiting anything (even a resolved promise) breaks the gesture context.
  triggerHaptic();
  triggerInstallBannerOnce();

  await requestStoragePersistence();
  await ensureAudioContextRunning();

  const tile = appState.tiles[index];

  switch (tile.state) {
    case 'empty': {
      let stream: MediaStream;
      try {
        stream = await getMicrophoneStream();
      } catch (err: unknown) {
        const name = err instanceof Error ? (err as { name?: string }).name : undefined;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          transitionTile(appState, index, 'error', {
            errorMessage: 'Mikrofon-Zugriff erforderlich. Tippe erneut zum Wiederholen.',
          });
        } else {
          transitionTile(appState, index, 'error', {
            errorMessage: 'Mikrofon nicht verfügbar.',
          });
        }
        updateTile(index, appState.tiles[index]);
        return;
      }

      const recordStartTime = Date.now();
      const stopRecordingTimer = startRecordingTimer(index);

      const activeRecording = startRecording(
        stream,
        // onComplete: called when recording stops (manual or auto-stop at 30s)
        (result) => {
          // Release wake lock as soon as recording data is assembled
          void releaseWakeLock();
          stopRecordingTimer();
          const durationSeconds = Math.round((Date.now() - recordStartTime) / 1000);
          transitionTile(appState, index, 'saving');
          updateTile(index, appState.tiles[index]);

          saveSlot(index, {
            blob: result.blob,
            mimeType: result.mimeType,
            recordedAt: Date.now(),
            durationSeconds,
          })
            .then(() => {
              const record = {
                blob: result.blob,
                mimeType: result.mimeType,
                recordedAt: Date.now(),
                durationSeconds,
              };
              transitionTile(appState, index, 'has-sound', { record });
              updateTile(index, appState.tiles[index]);
            })
            .catch((err: unknown) => {
              console.error('saveSlot failed:', err);
              transitionTile(appState, index, 'error', {
                errorMessage: 'Speichern fehlgeschlagen.',
              });
              updateTile(index, appState.tiles[index]);
            });
        },
        // onWarning: fires at 25s before the 30s auto-stop
        () => {
          const current = appState.tiles[index];
          if (current.state === 'recording') {
            current.warningActive = true;
            updateTile(index, appState.tiles[index]);
          }
        },
      );

      // Acquire wake lock after recording has started (non-blocking)
      void acquireWakeLock();
      transitionTile(appState, index, 'recording', { activeRecording });
      updateTile(index, appState.tiles[index]);
      break;
    }

    case 'recording': {
      const current = appState.tiles[index];
      void releaseWakeLock(); // manual stop — release before onComplete fires
      // Stop the active recording — triggers onComplete callback above
      // stopRecordingTimer() is called inside onComplete
      current.activeRecording?.stop();
      transitionTile(appState, index, 'saving');
      updateTile(index, appState.tiles[index]);
      break;
    }

    case 'has-sound': {
      const current = appState.tiles[index];
      if (!current.record) {
        console.error('has-sound tile missing record at index', index);
        return;
      }
      const record = current.record;
      transitionTile(appState, index, 'playing', { record });
      updateTile(index, appState.tiles[index]);
      try {
        await playBlob(index, record.blob, () => {
          // onEnded: playback completed naturally
          transitionTile(appState, index, 'has-sound', { record });
          updateTile(index, appState.tiles[index]);
        });
      } catch (err: unknown) {
        console.error('playBlob failed (defective blob):', err);
        // KEEP the record in IndexedDB — do NOT delete it (locked decision)
        transitionTile(appState, index, 'error', {
          errorMessage: 'Wiedergabe fehlgeschlagen. Datei defekt.',
          record,
        });
        updateTile(index, appState.tiles[index]);
      }
      break;
    }

    case 'playing': {
      const current = appState.tiles[index];
      const record = current.record;
      if (!record) {
        console.error('playing tile missing record at index', index);
        return;
      }
      // Stop current playback, then restart from the beginning (PLAY-02)
      stopTile(index);
      transitionTile(appState, index, 'playing', { record });
      updateTile(index, appState.tiles[index]);
      try {
        await playBlob(index, record.blob, () => {
          transitionTile(appState, index, 'has-sound', { record });
          updateTile(index, appState.tiles[index]);
        });
      } catch (err: unknown) {
        console.error('playBlob failed on re-tap (defective blob):', err);
        transitionTile(appState, index, 'error', {
          errorMessage: 'Wiedergabe fehlgeschlagen. Datei defekt.',
          record,
        });
        updateTile(index, appState.tiles[index]);
      }
      break;
    }

    case 'error': {
      const current = appState.tiles[index];
      if (current.record) {
        // Playback error — tile has a record but it's defective.
        // No-op: Phase 2 long-press re-record handles re-recording over defective blobs.
        break;
      }
      // Recording error — no record. Retry: go back to empty and attempt recording.
      transitionTile(appState, index, 'empty');
      updateTile(index, appState.tiles[index]);
      // Immediately retry recording (same tap) — triggerHaptic already called above
      await handleTileTap(index);
      break;
    }

    case 'saving': {
      // No-op: tap while save is in progress is ignored
      break;
    }

    default: {
      // TypeScript exhaustive check
      const _exhaustive: never = tile.state;
      console.error('Unknown tile state:', _exhaustive);
    }
  }
}

// ------- Long-press handler -------

async function handleLongPress(index: SlotIndex): Promise<void> {
  const tile = appState.tiles[index];

  // Only act on tiles that have a recording (has-sound, playing, or error-with-record)
  if (tile.state !== 'has-sound' && tile.state !== 'playing' && tile.state !== 'error') {
    return;
  }
  if (!tile.record) {
    return; // error state without a record — nothing to manage
  }

  const record = tile.record;

  showActionSheet(index, tile.label, record.durationSeconds, {
    onReRecord: () => {
      // Delete existing audio cache, reset to empty, then immediately trigger recording
      clearAudioCache(index);
      transitionTile(appState, index, 'empty');
      updateTile(index, appState.tiles[index]);
      handleTileTap(index).catch((err: unknown) => {
        console.error('Re-record tap error:', err);
      });
    },
    onDelete: () => {
      deleteSlot(index)
        .then(() => {
          clearAudioCache(index);
          transitionTile(appState, index, 'empty');
          updateTile(index, appState.tiles[index]);
        })
        .catch((err: unknown) => {
          console.error('deleteSlot failed:', err);
        });
    },
    onRename: () => {
      handleRename(index).catch((err: unknown) => {
        console.error('Rename error:', err);
      });
    },
  });
}

async function handleRename(index: SlotIndex): Promise<void> {
  const tile = appState.tiles[index];
  const newLabel = await showRenameDialog(tile.label ?? '');
  if (newLabel === null) return; // user cancelled
  tile.label = newLabel || undefined; // clear empty string to undefined
  // Persist label to IndexedDB
  const record = await loadSlot(index);
  if (record) {
    await saveSlot(index, { ...record, label: tile.label });
  }
  updateTile(index, tile);
}

// ------- Bootstrap -------

document.addEventListener('DOMContentLoaded', () => {
  loadAllSlots()
    .then((slots) => {
      slots.forEach((record, index) => {
        if (record) {
          const tile = transitionTile(appState, index, 'has-sound', { record });
          tile.label = record.label; // restore persisted label
        }
      });
      initGrid(
        appState,
        (index) => {
          handleTileTap(index as SlotIndex).catch((err: unknown) => {
            console.error('Unhandled tap error:', err);
          });
        },
        (index) => {
          handleLongPress(index as SlotIndex).catch((err: unknown) => {
            console.error('Unhandled long-press error:', err);
          });
        },
      );
      updateAllTiles(appState);
    })
    .catch((err: unknown) => {
      console.error('Failed to load slots from IndexedDB:', err);
      initGrid(
        appState,
        (index) => {
          handleTileTap(index as SlotIndex).catch((err2: unknown) => {
            console.error('Unhandled tap error:', err2);
          });
        },
        (index) => {
          handleLongPress(index as SlotIndex).catch((err2: unknown) => {
            console.error('Unhandled long-press error:', err2);
          });
        },
      );
    });
});

