import { getMicrophoneStream, startRecording } from './audio/recorder';
import { ensureAudioContextRunning, playBlob, stopTile, clearAudioCache, audioBufferCache, getAudioContext } from './audio/player';
import { loadAllSlots, saveSlot, loadSlot, deleteSlot, SlotIndex, SlotRecord, requestStoragePersistence } from './storage/db';
import { findTrimOffsets, applyTrimToRecord } from './audio/trim';
import { showTrimToast } from './ui/toast';
import { createAppState, transitionTile, AppState } from './state/store';
import { initGrid, updateTile, updateAllTiles } from './ui/grid';
import { triggerHaptic } from './ui/haptic';
import { showActionSheet } from './ui/action-sheet';
import { showRenameDialog } from './ui/rename-dialog';
import { showInstallBanner } from './ui/install-banner';
import { acquireWakeLock, releaseWakeLock } from './audio/wake-lock';
import { startRecordingViz, stopRecordingViz } from './ui/viz-recording';
import { startPlaybackProgress, stopPlaybackProgress } from './ui/viz-playback';
import { exportClip } from './ui/share';
import { pickAudioFile } from './audio/import';

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
          // Remove visualizer canvas before transitioning tile to saving state
          stopRecordingViz(index);
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
              // Auto-trim silence after recording completes (non-blocking)
              handleTrim(index).catch((err: unknown) => {
                console.error('Auto-trim error (non-fatal):', err);
              });
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
      // Start frequency bar visualizer AFTER updateTile — updateTile replaces innerHTML,
      // which would remove a canvas appended before it.
      startRecordingViz(index, stream);
      break;
    }

    case 'recording': {
      const current = appState.tiles[index];
      void releaseWakeLock(); // manual stop — release before onComplete fires
      // Remove visualizer canvas before recording stops (idempotent — onComplete will also call it)
      stopRecordingViz(index);
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
          stopPlaybackProgress(index); // Path 1: has-sound onEnded — remove ring before transition
          transitionTile(appState, index, 'has-sound', { record });
          updateTile(index, appState.tiles[index]);
        }, (startCtxTime, durationSec) => {
          // onStarted: audio hardware started — begin progress ring
          startPlaybackProgress(index, startCtxTime, durationSec);
        }, record.trimStartSec ?? 0, record.trimEndSec);
      } catch (err: unknown) {
        console.error('playBlob failed (defective blob):', err);
        stopPlaybackProgress(index); // Path 2: has-sound catch — remove ring on error
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
      stopPlaybackProgress(index); // Path 3: playing re-tap — remove old ring before stopTile
      stopTile(index);
      transitionTile(appState, index, 'playing', { record });
      updateTile(index, appState.tiles[index]);
      try {
        await playBlob(index, record.blob, () => {
          stopPlaybackProgress(index); // Path 4: playing onEnded — remove ring before transition
          transitionTile(appState, index, 'has-sound', { record });
          updateTile(index, appState.tiles[index]);
        }, (startCtxTime, durationSec) => {
          // onStarted: new playback started — begin fresh progress ring
          startPlaybackProgress(index, startCtxTime, durationSec);
        }, record.trimStartSec ?? 0, record.trimEndSec);
      } catch (err: unknown) {
        console.error('playBlob failed on re-tap (defective blob):', err);
        stopPlaybackProgress(index); // Path 5: playing catch — remove ring on error
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

  // Empty tile long-press → show import-only action sheet
  if (tile.state === 'empty') {
    showActionSheet(index, undefined, undefined, {
      onReRecord: () => {},
      onRename: () => {},
      onDelete: () => {},
      onColorChange: () => {},
      onImport: () => { importAndSave(index).catch(console.error); },
    }, undefined, 'import-only');
    return;
  }

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
    onColorChange: (color) => {
      handleColorChange(index, color).catch((err: unknown) => {
        console.error('Color change error:', err);
      });
    },
    onTrim: () => {
      handleTrim(index).catch((err: unknown) => {
        console.error('Trim error:', err);
      });
    },
    onExport: () => {
      exportClip(record, index);
    },
    onImport: () => { importAndSave(index).catch(console.error); },
  }, appState.tiles[index].color);
}

async function importAndSave(index: SlotIndex): Promise<void> {
  // CRITICAL: pickAudioFile() before any await — iOS gesture context is lost after first await
  const recordPromise = pickAudioFile();
  let record: SlotRecord | null;
  try {
    record = await recordPromise;
  } catch {
    showTrimToast(null, 'Format nicht unterstützt');
    return;
  }
  if (!record) return; // user cancelled

  clearAudioCache(index);
  transitionTile(appState, index, 'saving');
  updateTile(index, appState.tiles[index]);

  try {
    await saveSlot(index, record);
  } catch {
    transitionTile(appState, index, 'error', { errorMessage: 'Speichern fehlgeschlagen.' });
    updateTile(index, appState.tiles[index]);
    return;
  }

  transitionTile(appState, index, 'has-sound', { record });
  updateTile(index, appState.tiles[index]);

  handleTrim(index).catch(console.error); // auto-trim, non-blocking
}

async function handleColorChange(index: SlotIndex, color: string | undefined): Promise<void> {
  const record = await loadSlot(index);
  if (!record) return;
  await saveSlot(index, { ...record, color });
  const tile = appState.tiles[index];
  tile.color = color;
  updateTile(index, tile);
}

async function handleTrim(index: SlotIndex): Promise<void> {
  const tile = appState.tiles[index];
  if (!tile.record) return;

  // Get cached AudioBuffer — populated on first play; if not yet played, decode now
  let audioBuffer = audioBufferCache.get(index);
  if (!audioBuffer) {
    try {
      const arrayBuffer = await tile.record.blob.arrayBuffer();
      const ctx = getAudioContext();
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      audioBufferCache.set(index, audioBuffer);
    } catch {
      console.error('handleTrim: failed to decode audio for trim');
      return;
    }
  }

  const offsets = findTrimOffsets(audioBuffer);
  if (!offsets) {
    // Entirely silent or no detectable audio above threshold
    showTrimToast(null, 'Kein Ton gefunden');
    return;
  }

  const originalRecord = tile.record;
  const trimmedRecord = applyTrimToRecord(originalRecord, offsets.startSec, offsets.endSec);

  await saveSlot(index, trimmedRecord);
  tile.record = trimmedRecord;
  updateTile(index, appState.tiles[index]);

  showTrimToast(() => {
    // Undo: restore original record (trim offsets cleared, original duration restored)
    saveSlot(index, originalRecord).catch(console.error);
    tile.record = originalRecord;
    updateTile(index, appState.tiles[index]);
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
          const tile = transitionTile(appState, index, 'has-sound', {
            record,
            color: record.color, // restore persisted color; undefined for v1.0 records (correct)
          });
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

