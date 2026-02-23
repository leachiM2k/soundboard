import { formatDuration, TILE_COLORS } from './tile';
import { showConfirmDialog } from './confirm-dialog';

export interface ActionSheetCallbacks {
  onReRecord: () => void;
  onRename: () => void;
  onDelete: () => void;
  onColorChange: (color: string | undefined) => void;
  onTrim?: () => void;    // NEW: trigger silence trim
  onExport?: () => void;  // NEW: trigger clip export
}

/**
 * Show the action sheet for a filled tile.
 * Header shows: label (if set) OR "Kachel N · M:SS" if no label.
 * Button order (iOS HIG): Re-record, Rename, [spacer], Delete (destructive), Cancel.
 *
 * CRITICAL: Clone buttons before wiring to remove stale listeners from previous opens.
 * CRITICAL: Close on backdrop click (click on dialog element itself, not content).
 * CRITICAL: Swatch row rebuilt on every open (innerHTML = '') to prevent listener accumulation.
 */
export function showActionSheet(
  index: number,
  label: string | undefined,
  durationSeconds: number | undefined,
  callbacks: ActionSheetCallbacks,
  currentColor?: string,
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

  // Build color swatch row — rebuild on every open to prevent listener accumulation
  const swatchRow = document.getElementById('action-sheet-colors');
  if (swatchRow) {
    swatchRow.innerHTML = '';
    // Reset swatch (restores index-based default)
    const resetBtn = document.createElement('button');
    resetBtn.className = 'color-swatch color-swatch--reset';
    resetBtn.title = 'Farbe zurücksetzen';
    resetBtn.setAttribute('aria-label', 'Farbe zurücksetzen');
    resetBtn.addEventListener('click', () => {
      dialog.close();
      callbacks.onColorChange(undefined);
    });
    swatchRow.appendChild(resetBtn);
    // Preset swatches from TILE_COLORS
    TILE_COLORS.forEach((color) => {
      const btn = document.createElement('button');
      btn.className = 'color-swatch';
      btn.style.background = color;
      btn.setAttribute('aria-label', color);
      // Highlight currently active color
      if (currentColor === color) {
        btn.classList.add('color-swatch--active');
      }
      btn.addEventListener('click', () => {
        dialog.close();
        callbacks.onColorChange(color);
      });
      swatchRow.appendChild(btn);
    });
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
  wireBtn('btn-trim', () => { callbacks.onTrim?.(); });
  wireBtn('btn-export', () => { callbacks.onExport?.(); });
  wireBtn('btn-delete', () => {
    showConfirmDialog('Sound löschen?').then((confirmed) => {
      if (confirmed) callbacks.onDelete();
    });
  });
  wireBtn('btn-cancel', () => {}); // cancel just closes

  // Close on backdrop click (Pitfall 6 from research)
  // Guard: ignore clicks within 400ms of opening — on iOS PWA the finger-lift after
  // long-press synthesises a click that would otherwise immediately close the dialog.
  const openedAt = Date.now();
  const onDialogClick = (e: MouseEvent) => {
    if (e.target === dialog && Date.now() - openedAt > 400) {
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
