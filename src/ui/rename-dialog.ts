/**
 * Show the rename dialog pre-populated with currentName.
 * Returns the trimmed new name, or null if user cancelled.
 *
 * Uses custom <dialog> instead of window.prompt() — window.prompt has
 * known reliability issues in iOS standalone PWA mode and cannot be styled.
 *
 * Focus is delayed via requestAnimationFrame to work around iOS Safari
 * keyboard timing (keyboard won't appear if focus fires synchronously during showModal).
 */
export function showRenameDialog(currentName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.getElementById('rename-dialog') as HTMLDialogElement;
    const input = document.getElementById('rename-input') as HTMLInputElement;
    const form = document.getElementById('rename-form') as HTMLFormElement;
    const cancelBtn = document.getElementById('rename-cancel') as HTMLButtonElement;

    input.value = currentName;

    function handleSubmit(e: SubmitEvent) {
      e.preventDefault();
      const value = input.value.trim();
      dialog.close();
      cleanup();
      resolve(value || null);
    }

    function handleCancel() {
      dialog.close();
      cleanup();
      resolve(null);
    }

    function handleEsc() {
      // 'cancel' event fires on ESC key press
      cleanup();
      resolve(null);
    }

    function cleanup() {
      form.removeEventListener('submit', handleSubmit);
      cancelBtn.removeEventListener('click', handleCancel);
      dialog.removeEventListener('cancel', handleEsc);
    }

    form.addEventListener('submit', handleSubmit);
    cancelBtn.addEventListener('click', handleCancel);
    dialog.addEventListener('cancel', handleEsc, { once: true });

    dialog.showModal();

    // Delay focus: iOS Safari keyboard won't show if focus fires synchronously
    requestAnimationFrame(() => {
      input.focus();
      input.select(); // pre-select existing name for easy replacement
    });
  });
}
