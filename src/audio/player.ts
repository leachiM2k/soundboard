// One shared AudioContext for the entire app.
// Safari hard-limits at 4 AudioContext instances — never create more than one.
// Lazy init: creating at module load causes Safari suspension.
let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    // statechange fires as 'interrupted' during phone calls or app backgrounding.
    // We do NOT auto-resume from interruption — the next user tap calls resume() naturally.
    audioContext.addEventListener('statechange', () => {
      // Intentional no-op: state logged for debugging, auto-resume is an anti-pattern on iOS.
      // The "resume on every tap" pattern in ensureAudioContextRunning() handles recovery.
    });
  }
  return audioContext;
}

/**
 * Call at the START of every user tap handler, before any audio operation.
 * iOS Safari silently produces no audio (no error) if the AudioContext is suspended
 * and resume() was not called inside the user gesture handler.
 * This also recovers from 'interrupted' state after phone calls or backgrounding.
 */
export async function ensureAudioContextRunning(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state !== 'running') {
    await ctx.resume();
  }
}

// ------- Per-tile playback management -------

// Track the active AudioBufferSourceNode per tile.
// Supports stop-and-restart for the same tile (PLAY-02) while allowing
// parallel playback across different tiles (locked decision).
const activeNodes = new Map<number, AudioBufferSourceNode>();

// AudioBuffer cache: decode on first play, reuse on subsequent plays.
// Avoids re-decoding the same blob repeatedly (decode takes ~10-50ms).
// Cache is keyed by tile index — cleared when a tile's recording is deleted or replaced.
const audioBufferCache = new Map<number, AudioBuffer>();

/**
 * Play the audio blob for the given tile.
 * Stops any existing playback for THIS tile (but not other tiles — parallel playback).
 * Caches the decoded AudioBuffer for repeat plays.
 * Throws if decodeAudioData fails — caller shows error message and KEEPS the blob.
 *
 * MUST call ensureAudioContextRunning() before this in the tap handler.
 */
export async function playBlob(
  tileIndex: number,
  blob: Blob,
  onEnded: () => void,
  onStarted?: (startCtxTime: number, durationSec: number) => void,
): Promise<void> {
  const ctx = getAudioContext();

  // Stop existing playback for THIS tile only (PLAY-02: stop and restart on re-tap).
  // Other tiles continue playing — parallel playback is the locked behavior.
  stopTile(tileIndex);

  // Decode the blob to an AudioBuffer (or reuse cached result).
  // decodeAudioData can throw on defective blobs.
  // We let the error propagate — caller is responsible for showing error message
  // and must NOT delete the blob from storage (per locked decision).
  let audioBuffer = audioBufferCache.get(tileIndex);
  if (!audioBuffer) {
    const arrayBuffer = await blob.arrayBuffer();
    // Promise form of decodeAudioData (not the legacy callback form).
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    audioBufferCache.set(tileIndex, audioBuffer);
  }

  // AudioBufferSourceNode is single-use by design — create a new one each play.
  // The AudioBuffer itself is reused (from cache above).
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  source.onended = () => {
    // Clean up only if this node is still the active one.
    // If stopTile() was called (re-tap), activeNodes already deleted this entry —
    // onEnded should not fire the "tile → idle" callback in that case.
    if (activeNodes.get(tileIndex) === source) {
      activeNodes.delete(tileIndex);
      onEnded(); // Tile returns to filled/idle state (played to completion)
    }
  };

  activeNodes.set(tileIndex, source);
  source.start(0); // Start immediately
  const startCtxTime = ctx.currentTime; // capture AFTER start() — most accurate
  onStarted?.(startCtxTime, audioBuffer.duration);
}

/**
 * Stop playback for a specific tile. Safe to call when tile is not playing.
 * Does NOT affect playback on other tiles.
 */
export function stopTile(tileIndex: number): void {
  const existing = activeNodes.get(tileIndex);
  if (existing) {
    try {
      existing.stop();
    } catch {
      // AudioBufferSourceNode.stop() throws if the node has already stopped naturally.
      // This is safe to ignore — the node is already done.
    }
    activeNodes.delete(tileIndex);
  }
}

/**
 * Clear the AudioBuffer cache for a specific tile.
 * Call when a tile's recording is deleted or replaced (the old AudioBuffer is stale).
 */
export function clearAudioCache(tileIndex: number): void {
  audioBufferCache.delete(tileIndex);
}
