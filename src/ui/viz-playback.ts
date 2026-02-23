import { getAudioContext } from '../audio/player';

// SVG ring geometry — RADIUS 22px fits inside iPhone SE tile (~115px wide with gaps)
const RADIUS = 22; // px
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~138.23px

// 30fps cap — prevents battery drain from 60fps redraw on a purely cosmetic overlay
const TARGET_INTERVAL_MS = 1000 / 30;

// Per-tile active progress ring lifecycle. Each entry owns a stop() method that
// cancels the rAF loop and removes the SVG element from the DOM.
const activeProgressMap = new Map<number, { stop: () => void }>();

/**
 * Start a clockwise SVG progress ring on the tile at `index`.
 * The ring fills from 0% to 100% over `durationSec` seconds, driven by
 * AudioContext.currentTime (hardware-synchronized clock, not Date.now).
 *
 * Call stopPlaybackProgress(index) to remove the ring early (re-tap, error path).
 * Idempotent: removes any existing ring for this index before creating a new one.
 */
export function startPlaybackProgress(
  index: number,
  startCtxTime: number,
  durationSec: number,
): void {
  // Idempotent: remove any in-flight ring for this slot before creating a new one
  stopPlaybackProgress(index);

  const tile = document.querySelector(`[data-slot="${index}"]`) as HTMLElement | null;
  if (!tile) return;

  // Build SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'tile-progress-ring');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 52 52');

  // Build progress circle
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '26');
  circle.setAttribute('cy', '26');
  circle.setAttribute('r', String(RADIUS));
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'rgba(255,255,255,0.85)');
  circle.setAttribute('stroke-width', '3');
  circle.setAttribute('stroke-linecap', 'round');
  // Full offset = 0% progress (ring is empty). As fraction grows, offset shrinks toward 0 (full ring).
  circle.style.strokeDasharray = String(CIRCUMFERENCE);
  circle.style.strokeDashoffset = String(CIRCUMFERENCE);
  // Start at top (12 o'clock), not at 3 o'clock (default SVG origin)
  circle.style.transform = 'rotate(-90deg)';
  circle.style.transformOrigin = '50% 50%';

  svg.appendChild(circle);
  tile.appendChild(svg);

  let rafHandle = 0;
  let lastTickTime = 0;

  function tick(timestamp: number): void {
    // 30fps cap: skip frame if not enough time has elapsed since last draw
    if (timestamp - lastTickTime < TARGET_INTERVAL_MS) {
      rafHandle = requestAnimationFrame(tick);
      return;
    }
    lastTickTime = timestamp;

    // Use AudioContext.currentTime — synchronized to audio hardware clock, not wall clock.
    // This ensures the ring fills in exact sync with the audio playback position.
    const ctx = getAudioContext();
    const elapsed = ctx.currentTime - startCtxTime;
    const fraction = Math.min(1, elapsed / durationSec);

    // fraction=0 → full offset (empty ring); fraction=1 → 0 offset (complete ring)
    circle.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - fraction));

    if (fraction >= 1) {
      // Playback complete — clean up ring from DOM and map
      cancelAnimationFrame(rafHandle);
      svg.remove();
      activeProgressMap.delete(index);
      return;
    }

    rafHandle = requestAnimationFrame(tick);
  }

  rafHandle = requestAnimationFrame(tick);

  activeProgressMap.set(index, {
    stop: () => {
      cancelAnimationFrame(rafHandle);
      svg.remove();
    },
  });
}

/**
 * Remove the progress ring for the tile at `index` immediately.
 * Safe to call when no ring is active (no-op).
 * Call before stopTile() on re-tap, and in onEnded / catch blocks.
 */
export function stopPlaybackProgress(index: number): void {
  const entry = activeProgressMap.get(index);
  if (entry) {
    entry.stop();
    activeProgressMap.delete(index);
  }
}
