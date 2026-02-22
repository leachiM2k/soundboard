/**
 * Trigger native haptic feedback.
 * iOS 17.4+: clicks a hidden <input type="checkbox" switch> element (WebKit switch input).
 *            This triggers the native system haptic. Safe no-op on older iOS.
 * Android:   navigator.vibrate(10) — 10ms vibration.
 * Desktop / unsupported: silent no-op.
 *
 * The hidden input is created once and reused (lazy init).
 * MUST be called inside a user gesture (touchstart/click) — same restriction as AudioContext.
 */

const _isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
let _switchEl: HTMLInputElement | null = null;

export function triggerHaptic(): void {
  if (_isIOS) {
    if (!_switchEl) {
      _switchEl = document.createElement('input');
      _switchEl.type = 'checkbox';
      _switchEl.setAttribute('switch', '');
      Object.assign(_switchEl.style, {
        position: 'fixed',
        opacity: '0',
        pointerEvents: 'none',
        width: '0',
        height: '0',
      });
      document.body.appendChild(_switchEl);
    }
    _switchEl.click();
    return;
  }
  navigator.vibrate?.(10);
}
