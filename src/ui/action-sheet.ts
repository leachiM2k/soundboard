import { formatDuration } from './tile';

export interface ActionSheetCallbacks {
  onReRecord: () => void;
  onRename: () => void;
  onDelete: () => void;
}

/**
 * Show the action sheet for a filled tile.
 * Header shows: label (if set) OR "Kachel N · M:SS" if no label.
 * Button order (iOS HIG): Re-record, Rename, [spacer], Delete (destructive), Cancel.
 *
 * CRITICAL: Clone buttons before wiring to remove stale listeners from previous opens.
 * CRITICAL: Close on backdrop click (click on dialog element itself, not content).
 */
export function showActionSheet(
  index: number,
  label: string | undefined,
  durationSeconds: number | undefined,
  callbacks: ActionSheetCallbacks,
): void {
  const dialog = document.getElementById('action-sheet') as HTMLDialogElement;
  const header = document.getElementById('action-sheet-header');

  // Set header text
  if (header) {
    if (label) {
      header.textContent = label;
    } else if (durationSeconds != null) {
      header.textContent = `Kachel ${index + 1} · ${formatDuration(durationSeconds)}`;
    } else {
      header.textContent = `Kachel ${index + 1}`;
    }
  }

  // Wire buttons — replace each button with a clone to drop stale listeners
  function wireBtn(id: string, handler: () => void) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const clone = btn.cloneNode(true) as HTMLButtonElement;
    btn.replaceWith(clone);
    clone.addEventListener('click', () => {
      dialog.close();
      handler();
    });
  }

  wireBtn('btn-rerecord', callbacks.onReRecord);
  wireBtn('btn-rename', callbacks.onRename);
  wireBtn('btn-delete', callbacks.onDelete);
  wireBtn('btn-cancel', () => {}); // cancel just closes

  // Close on backdrop click (Pitfall 6 from research)
  const onDialogClick = (e: MouseEvent) => {
    if (e.target === dialog) {
      dialog.close();
      dialog.removeEventListener('click', onDialogClick);
    }
  };
  dialog.addEventListener('click', onDialogClick);

  // Clean up backdrop listener when dialog closes for any reason
  dialog.addEventListener('close', () => {
    dialog.removeEventListener('click', onDialogClick);
  }, { once: true });

  dialog.showModal();
}
