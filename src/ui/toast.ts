/**
 * Ephemeral toast notification for trim feedback.
 * Auto-dismisses after 5 seconds. Shows an Undo button when onUndo is provided.
 * Only one toast is shown at a time — previous toast is removed on new call.
 */

/**
 * Show a trim toast notification.
 *
 * @param onUndo  Callback invoked when the user taps "Rückgängig".
 *                Pass null to show the toast without an Undo button
 *                (used for the "Kein Ton gefunden" case).
 * @param message Optional message override. Defaults to "Stille entfernt".
 */
export function showTrimToast(
  onUndo: (() => void) | null,
  message = 'Stille entfernt',
): void {
  // Remove any existing toast before showing a new one
  document.querySelector('.toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';

  if (onUndo !== null) {
    toast.innerHTML = `<span>${message}</span><button class="toast-undo">R\u00fckg\u00e4ngig</button>`;
    toast.querySelector('.toast-undo')!.addEventListener('click', () => {
      toast.remove();
      onUndo();
    });
  } else {
    toast.innerHTML = `<span>${message}</span>`;
  }

  document.getElementById('app')!.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
