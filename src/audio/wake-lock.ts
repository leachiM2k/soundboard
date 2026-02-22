// src/audio/wake-lock.ts
// Screen Wake Lock API — prevents screen sleep during active recording.
// Feature detection + try/catch: failure is non-fatal; recording continues.
// Note: Wake Lock broken in iOS standalone PWA mode before iOS 18.4 (fixed March 2025).
// Users on older iOS will not see errors — the lock simply fails silently.

let wakeLock: WakeLockSentinel | null = null;

export async function acquireWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return; // Not supported — silent no-op
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // NotAllowedError or other — non-fatal; recording continues without wake lock
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (wakeLock) {
    try {
      await wakeLock.release();
    } catch {
      // Ignore release errors — sentinel may already be released (e.g., tab went hidden)
    }
    wakeLock = null;
  }
}
