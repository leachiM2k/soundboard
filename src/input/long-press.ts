/**
 * Attach an iOS-safe long-press detector to an element.
 * Uses touchstart + setTimeout (500ms default) pattern.
 * contextmenu event is NOT used — it does not fire on iOS Safari.
 *
 * CRITICAL: touchstart listener is { passive: true } — required to avoid iOS scroll delay.
 * CRITICAL: touch-action: none must be set on the element via CSS (not done here).
 *
 * Returns a cleanup function that removes all listeners.
 */
export function attachLongPress(
  el: HTMLElement,
  onLongPress: () => void,
  thresholdMs = 500,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let longPressActivated = false;

  function start(e: TouchEvent | MouseEvent) {
    if (e instanceof TouchEvent && e.touches.length > 1) return;
    longPressActivated = false;
    timer = setTimeout(() => {
      timer = null;
      longPressActivated = true;
      onLongPress();
    }, thresholdMs);
  }

  function cancel() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }

  function onTouchEnd(e: TouchEvent) {
    if (longPressActivated) {
      e.preventDefault(); // suppress synthetic click after long-press
      longPressActivated = false;
    }
    cancel();
  }

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchmove', cancel);
  el.addEventListener('touchcancel', cancel);

  // Mouse support for desktop — only fires when no touch is active
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);

  return () => {
    cancel();
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchmove', cancel);
    el.removeEventListener('touchcancel', cancel);
    el.removeEventListener('mousedown', start);
    el.removeEventListener('mouseup', cancel);
    el.removeEventListener('mouseleave', cancel);
  };
}
