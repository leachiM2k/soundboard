import { getAudioContext } from '../audio/player';

// Map from tile index to the active viz cleanup handle
const activeVizMap = new Map<number, { stop: () => void }>();

const BAR_COUNT = 12;
const TARGET_INTERVAL_MS = 1000 / 30; // cap at 30fps

/**
 * Start a real-time frequency bar visualizer on the tile at the given index.
 * Connects the MediaStream to an AnalyserNode (NOT to ctx.destination — no speaker feedback on iOS).
 * Appends a <canvas> overlay to the tile element and runs a rAF draw loop at up to 30fps.
 *
 * Safe to call even if a viz is already running on the same tile (stops the previous one first).
 */
export function startRecordingViz(index: number, stream: MediaStream): void {
  // Idempotent: clear any leftover viz on this tile before starting a new one
  stopRecordingViz(index);

  const ctx = getAudioContext();

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.75;

  const source = ctx.createMediaStreamSource(stream);
  // IMPORTANT: connect source → analyser only. Do NOT connect analyser → ctx.destination.
  // Routing mic audio to destination causes speaker feedback on iOS.
  source.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const tileEl = document.querySelector(`[data-slot="${index}"]`) as HTMLElement | null;
  if (!tileEl) {
    // Tile not found — clean up nodes and bail
    source.disconnect();
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'tile-viz-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  // Set drawing buffer dimensions from the tile's actual rendered size.
  // If we only set width/height via CSS the drawing buffer stays at 300x150.
  const rect = tileEl.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);

  tileEl.appendChild(canvas);

  const canvasCtx = canvas.getContext('2d');
  if (!canvasCtx) {
    // Canvas 2D not available — clean up and bail
    canvas.remove();
    source.disconnect();
    return;
  }

  let rafHandle: number;
  let lastFrameTime = 0;

  function draw(timestamp: number): void {
    // Cap frame rate at 30fps
    if (timestamp - lastFrameTime < TARGET_INTERVAL_MS) {
      rafHandle = requestAnimationFrame(draw);
      return;
    }
    lastFrameTime = timestamp;

    analyser.getByteFrequencyData(dataArray);

    canvasCtx!.clearRect(0, 0, canvas.width, canvas.height);

    const step = Math.floor(bufferLength / BAR_COUNT);
    const barW = Math.floor((canvas.width - 8) / BAR_COUNT) - 2;
    const maxH = canvas.height - 8;

    for (let i = 0; i < BAR_COUNT; i++) {
      const value = dataArray[i * step] ?? 0;
      const barH = Math.max(3, Math.round((value / 255) * maxH));
      const x = 4 + i * (barW + 2);
      const y = canvas.height - barH - 4;

      // Opacity scales with signal level for a more dynamic look
      canvasCtx!.fillStyle = `rgba(255, 255, 255, ${0.4 + (value / 255) * 0.6})`;
      // Use fillRect — NOT roundRect (unavailable on iOS 14.x; project targets iOS 14.3+)
      canvasCtx!.fillRect(x, y, barW, barH);
    }

    rafHandle = requestAnimationFrame(draw);
  }

  rafHandle = requestAnimationFrame(draw);

  activeVizMap.set(index, {
    stop: () => {
      cancelAnimationFrame(rafHandle);
      source.disconnect();
      analyser.disconnect();
      canvas.remove();
    },
  });
}

/**
 * Stop and clean up the recording visualizer for the given tile index.
 * Safe to call when no viz is active (no-op).
 * Also safe to call multiple times — the second call is a no-op.
 */
export function stopRecordingViz(index: number): void {
  const entry = activeVizMap.get(index);
  if (entry) {
    entry.stop();
    activeVizMap.delete(index);
  }
}
