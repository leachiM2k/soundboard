import { RECORDING_MIME_TYPE } from './audio/format';
import { getMicrophoneStream, startRecording } from './audio/recorder';
import { ensureAudioContextRunning, playBlob, stopTile } from './audio/player';
import { loadAllSlots, saveSlot, SlotIndex, requestStoragePersistence } from './storage/db';
import { createAppState, transitionTile, AppState } from './state/store';

const appState: AppState = createAppState();

function renderTiles(state: AppState): void {
  const container = document.getElementById('tiles');
  if (!container) return;
  container.innerHTML = '';
  state.tiles.forEach((tile, index) => {
    const btn = document.createElement('button');
    btn.dataset.slot = String(index);
    let label = `Slot ${index}: ${tile.state}`;
    if (tile.state === 'recording' && tile.warningActive) label += ' (25s!)';
    if (tile.state === 'error' && tile.errorMessage) label += `\n${tile.errorMessage}`;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      handleTileTap(index as SlotIndex).catch((err: unknown) => {
        console.error('Unhandled error in tap handler:', err);
      });
    });
    container.appendChild(btn);
  });
}

async function handleTileTap(index: SlotIndex): Promise<void> {
  await requestStoragePersistence(); // STOR-03: first interaction (idempotent)
  await ensureAudioContextRunning(); // iOS AudioContext unlock (MUST be first audio op)

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
        renderTiles(appState);
        return;
      }

      const activeRecording = startRecording(
        stream,
        // onComplete: called when recording stops (manual or auto-stop at 30s)
        (result) => {
          transitionTile(appState, index, 'saving');
          renderTiles(appState);

          saveSlot(index, {
            blob: result.blob,
            mimeType: result.mimeType,
            recordedAt: Date.now(),
          })
            .then(() => {
              const saved = appState.tiles[index];
              transitionTile(appState, index, 'has-sound', {
                record: {
                  blob: result.blob,
                  mimeType: result.mimeType,
                  recordedAt: saved?.state === 'saving'
                    ? Date.now()
                    : Date.now(),
                },
              });
              renderTiles(appState);
            })
            .catch((err: unknown) => {
              console.error('saveSlot failed:', err);
              transitionTile(appState, index, 'error', {
                errorMessage: 'Speichern fehlgeschlagen.',
              });
              renderTiles(appState);
            });
        },
        // onWarning: fires at 25s before the 30s auto-stop
        () => {
          const current = appState.tiles[index];
          if (current.state === 'recording') {
            current.warningActive = true;
            renderTiles(appState);
          }
        },
      );

      transitionTile(appState, index, 'recording', { activeRecording });
      renderTiles(appState);
      break;
    }

    case 'recording': {
      const current = appState.tiles[index];
      // Stop the active recording — triggers onComplete callback above
      current.activeRecording?.stop();
      transitionTile(appState, index, 'saving');
      renderTiles(appState);
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
      renderTiles(appState);
      try {
        await playBlob(index, record.blob, () => {
          // onEnded: playback completed naturally
          transitionTile(appState, index, 'has-sound', { record });
          renderTiles(appState);
        });
      } catch (err: unknown) {
        console.error('playBlob failed (defective blob):', err);
        // KEEP the record in IndexedDB — do NOT delete it (locked decision)
        transitionTile(appState, index, 'error', {
          errorMessage: 'Wiedergabe fehlgeschlagen. Datei defekt.',
          record,
        });
        renderTiles(appState);
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
      renderTiles(appState);
      try {
        await playBlob(index, record.blob, () => {
          transitionTile(appState, index, 'has-sound', { record });
          renderTiles(appState);
        });
      } catch (err: unknown) {
        console.error('playBlob failed on re-tap (defective blob):', err);
        transitionTile(appState, index, 'error', {
          errorMessage: 'Wiedergabe fehlgeschlagen. Datei defekt.',
          record,
        });
        renderTiles(appState);
      }
      break;
    }

    case 'error': {
      const current = appState.tiles[index];
      if (current.record) {
        // Playback error — tile has a record but it's defective.
        // Phase 1: no-op. Phase 2 will allow re-record via long-press.
        // The error message stays visible until Phase 2 adds re-record UX.
        break;
      }
      // Recording error — no record. Retry: go back to empty and attempt recording.
      transitionTile(appState, index, 'empty');
      renderTiles(appState);
      // Immediately retry recording (same tap)
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

document.addEventListener('DOMContentLoaded', () => {
  loadAllSlots()
    .then((slots) => {
      slots.forEach((record, index) => {
        if (record) {
          transitionTile(appState, index, 'has-sound', { record });
        }
      });
      renderTiles(appState);
      // Log detected MIME type for debugging on device
      console.log('Detected recording MIME type:', RECORDING_MIME_TYPE || '(browser default)');
    })
    .catch((err: unknown) => {
      console.error('Failed to load slots from IndexedDB:', err);
      renderTiles(appState);
    });
});
