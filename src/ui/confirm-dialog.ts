/**
 * Show a confirmation dialog with the given message.
 * Returns true if the user confirmed, false if cancelled or dismissed.
 *
 * Uses clone-before-wire pattern (same as action-sheet.ts) to prevent
 * listener accumulation on repeated opens.
 */
export function showConfirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirm-dialog') as HTMLDialogElement | null;
    const msgEl = document.getElementById('confirm-dialog-message');
    const btnConfirm = document.getElementById('confirm-dialog-confirm') as HTMLButtonElement | null;
    const btnCancel = document.getElementById('confirm-dialog-cancel') as HTMLButtonElement | null;

    if (!dialog || !msgEl || !btnConfirm || !btnCancel) {
      resolve(false);
      return;
    }

    msgEl.textContent = message;

    // Clone buttons to drop stale listeners from previous opens
    const newBtnConfirm = btnConfirm.cloneNode(true) as HTMLButtonElement;
    const newBtnCancel = btnCancel.cloneNode(true) as HTMLButtonElement;
    btnConfirm.replaceWith(newBtnConfirm);
    btnCancel.replaceWith(newBtnCancel);

    newBtnConfirm.addEventListener('click', () => {
      dialog.close();
      resolve(true);
    });

    newBtnCancel.addEventListener('click', () => {
      dialog.close();
      resolve(false);
    });

    // Safety net: resolves false if dialog is closed by any other means (ESC, backdrop)
    dialog.addEventListener('close', () => resolve(false), { once: true });

    dialog.showModal();
  });
}
