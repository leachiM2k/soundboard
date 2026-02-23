# Phase 5: Visual Feedback - Research

**Researched:** 2026-02-23
**Domain:** Web Audio API (AnalyserNode), Canvas 2D, SVG progress ring, requestAnimationFrame throttling, iOS Safari audio graph constraints
**Confidence:** HIGH

## Summary

Phase 5 adds two real-time visual overlays to the existing tile UI: frequency bars during recording (VIZ-01) and a playback progress ring during playback (UX-03). Both features are pure front-end additions with no new npm packages. All browser APIs required are already in use or available via the existing `getAudioContext()` singleton in `player.ts`.

The recording visualizer (VIZ-01) uses `AnalyserNode` connected to the shared `AudioContext` singleton and the existing cached microphone `MediaStream`. The critical iOS constraint is that `MediaStreamAudioSourceNode` must NOT be connected to `ctx.destination` — doing so routes microphone audio to the speakers, causing feedback. The analyser reads data without forwarding audio to the output. `getByteFrequencyData` (not `getFloatTimeDomainData`, which is missing on Safari) is the correct method. A canvas element is dynamically created, appended to the recording tile, and removed when recording stops. The rAF loop is capped at 30fps via a timestamp delta guard (iOS Low Power Mode throttles rAF to 30fps naturally; the guard makes this explicit and correct on full-power mode too).

The playback progress indicator (UX-03) tracks elapsed time by storing `audioContext.currentTime` at `source.start()` and computing `elapsed / buffer.duration` each rAF frame. The result drives an SVG `<circle>` stroke-dashoffset or a CSS transform on a `<div>` overlay. There is no built-in `playbackPosition` property on `AudioBufferSourceNode`; the `currentTime`-based calculation is the standard approach. The rAF handle is stored and cancelled immediately when playback stops (re-tap or natural end via `onEnded`), so the progress ring disappears cleanly.

The STATE.md constraint "Cap RAF at 30fps; cancel RAF + disconnect nodes in ALL stop paths (manual, auto-stop, error)" is the primary guard for both features. All teardown paths in `main.ts` — manual recording stop, manual playback stop (re-tap), and natural `onEnded` — must call the relevant cleanup functions.

**Primary recommendation:** Build VIZ-01 first (recording visualizer) as its AnalyserNode setup pattern informs teardown discipline. Build UX-03 second (playback progress ring). Each is a standalone module with a clean start/stop API.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIZ-01 | User sees real-time frequency bars (bar style) during recording; animation proves microphone is active | `AnalyserNode` + `getByteFrequencyData` on shared `AudioContext`; canvas overlay on tile; rAF loop capped at 30fps; disconnect and remove canvas in ALL stop paths |
| UX-03 | User sees a progress ring or bar on tile during playback filling 0-100% in real time; disappears immediately on stop | `audioContext.currentTime` elapsed tracking; SVG ring or CSS clip-path overlay; rAF loop; cancel rAF on manual stop and `onEnded`; pass `startTime` and `buffer.duration` to progress module |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API `AnalyserNode` | Browser-native | Frequency data from mic stream | Only correct API for real-time frequency analysis; already in the same `AudioContext` singleton used by `player.ts` |
| Canvas 2D API | Browser-native | Render frequency bars | Fastest path for rAF-driven imperative drawing; no DOM thrash; fits the existing dark tile background |
| `requestAnimationFrame` | Browser-native | Drive both animation loops | Standard; iOS Low Power Mode throttles to 30fps naturally; explicit 30fps cap prevents battery drain on full-power mode |
| SVG `<circle>` stroke-dashoffset | Browser-native | Playback progress ring | Declarative, GPU-composited, no layout reflow; circumference math is 3 lines; works on all iOS Safari versions |
| `AudioContext.currentTime` | Browser-native | Compute playback elapsed fraction | Read-only hardware clock; available iOS 14+; pattern: store `ctx.currentTime` at `source.start()`, compute `(ctx.currentTime - startTime) / buffer.duration` each frame |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `AudioContext.createAnalyser()` | Browser-native | Create analyser node | Call once per recording session, connected to `createMediaStreamSource(stream)` |
| `AudioContext.createMediaStreamSource(stream)` | Browser-native | Bridge from `MediaStream` to Web Audio graph | Wrap the existing `cachedStream` from `recorder.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas 2D frequency bars | CSS `scaleY` transforms on `<div>` bars | CSS approach requires DOM mutation per frame (9-16 divs); Canvas avoids DOM layout; Canvas is correct for 30fps imperative animation |
| SVG `stroke-dashoffset` progress ring | CSS clip-path on a div | Both work; SVG ring is more visually precise and widely documented; clip-path on circular element has lower browser support edge cases |
| SVG `stroke-dashoffset` progress ring | CSS conic-gradient | Conic-gradient on iOS 14 Safari has known rendering quirks; SVG is safer for this target |
| `audioContext.currentTime` elapsed | `Date.now()` elapsed | `currentTime` is synchronized to the audio clock; `Date.now()` can drift slightly from audio; `currentTime` is the correct approach |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── audio/
│   ├── player.ts          # MODIFY: export startTime + buffer.duration alongside source node
│   └── recorder.ts        # NO CHANGE: stream already exposed via getMicrophoneStream()
├── ui/
│   ├── viz-recording.ts   # NEW: startRecordingViz(index, stream) / stopRecordingViz(index)
│   ├── viz-playback.ts    # NEW: startPlaybackProgress(index, startCtxTime, durationSec) / stopPlaybackProgress(index)
│   └── tile.ts            # NO CHANGE: canvas and SVG elements are injected/removed by viz modules
└── main.ts                # MODIFY: call viz start/stop in recording and playback tap handlers
```

### Pattern 1: AnalyserNode for Mic Frequency Bars (VIZ-01)

**What:** Create an `AnalyserNode` on the shared `AudioContext`, connect the microphone `MediaStream` source to it (but NOT to `ctx.destination`), draw bars each frame.

**When to use:** `tile.state === 'recording'` — start after `startRecording()` returns the `ActiveRecording` handle.

**Critical iOS constraint:** Do NOT connect `analyser.connect(ctx.destination)`. iOS Safari routes microphone audio to speakers if a `MediaStreamAudioSourceNode` is connected to destination. The analyser reads data without the source needing to reach destination. The `MediaRecorder` on the stream works independently of the Web Audio graph.

**Example:**

```typescript
// src/ui/viz-recording.ts
import { getAudioContext } from '../audio/player';

interface RecordingViz {
  stop: () => void;
}

const activeVizMap = new Map<number, RecordingViz>();

export function startRecordingViz(index: number, stream: MediaStream): void {
  stopRecordingViz(index); // clear any leftover

  const ctx = getAudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64; // 32 frequency bins — enough for 8-16 visible bars
  analyser.smoothingTimeConstant = 0.75;

  const source = ctx.createMediaStreamSource(stream);
  source.connect(analyser);
  // DO NOT connect to ctx.destination — prevents mic-to-speaker feedback on iOS

  const bufferLength = analyser.frequencyBinCount; // 32
  const dataArray = new Uint8Array(bufferLength);

  // Create canvas overlay
  const tileEl = document.querySelector(`[data-slot="${index}"]`) as HTMLElement | null;
  if (!tileEl) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'tile-viz-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  tileEl.appendChild(canvas);

  // Size canvas to match tile
  const { width, height } = tileEl.getBoundingClientRect();
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);

  const canvasCtx = canvas.getContext('2d')!;

  // 30fps cap: only draw if >33ms since last frame
  const TARGET_INTERVAL_MS = 1000 / 30;
  let lastFrameTime = 0;
  let rafHandle = 0;

  function draw(timestamp: number): void {
    rafHandle = requestAnimationFrame(draw);
    if (timestamp - lastFrameTime < TARGET_INTERVAL_MS) return;
    lastFrameTime = timestamp;

    analyser.getByteFrequencyData(dataArray);

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    const BAR_COUNT = 12;
    const step = Math.floor(bufferLength / BAR_COUNT);
    const barW = Math.floor((canvas.width - 8) / BAR_COUNT) - 2;
    const maxH = canvas.height - 8;

    for (let i = 0; i < BAR_COUNT; i++) {
      const value = dataArray[i * step] ?? 0;
      const barH = Math.max(3, Math.round((value / 255) * maxH));
      const x = 4 + i * (barW + 2);
      const y = canvas.height - barH - 4;

      canvasCtx.fillStyle = `rgba(255, 255, 255, ${0.4 + (value / 255) * 0.6})`;
      canvasCtx.beginPath();
      canvasCtx.roundRect(x, y, barW, barH, 2);
      canvasCtx.fill();
    }
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

export function stopRecordingViz(index: number): void {
  const viz = activeVizMap.get(index);
  if (viz) {
    viz.stop();
    activeVizMap.delete(index);
  }
}
```

### Pattern 2: Playback Progress Ring (UX-03)

**What:** Inject an SVG `<circle>` overlay into the playing tile. Each rAF frame compute `elapsed = ctx.currentTime - startCtxTime`, compute fraction `= elapsed / durationSec`, then set `stroke-dashoffset`. Remove on stop or natural end.

**When to use:** Immediately after `source.start(0)` in `playBlob()` — pass `ctx.currentTime` (captured just before `start()`) and `audioBuffer.duration` to the progress module.

**Example:**

```typescript
// src/ui/viz-playback.ts
import { getAudioContext } from '../audio/player';

interface PlaybackProgress {
  stop: () => void;
}

const activeProgressMap = new Map<number, PlaybackProgress>();

// SVG ring geometry
const RADIUS = 22; // px — fits inside smallest tile
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function startPlaybackProgress(
  index: number,
  startCtxTime: number,
  durationSec: number,
): void {
  stopPlaybackProgress(index); // clear any leftover

  const tileEl = document.querySelector(`[data-slot="${index}"]`) as HTMLElement | null;
  if (!tileEl) return;

  // Build SVG ring
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'tile-progress-ring');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 52 52');

  const circle = document.createElementNS(svgNS, 'circle');
  circle.setAttribute('cx', '26');
  circle.setAttribute('cy', '26');
  circle.setAttribute('r', String(RADIUS));
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'rgba(255,255,255,0.85)');
  circle.setAttribute('stroke-width', '3');
  circle.setAttribute('stroke-linecap', 'round');
  circle.style.strokeDasharray = String(CIRCUMFERENCE);
  circle.style.strokeDashoffset = String(CIRCUMFERENCE); // start empty
  circle.style.transform = 'rotate(-90deg)';
  circle.style.transformOrigin = '50% 50%';

  svg.appendChild(circle);
  tileEl.appendChild(svg);

  const ctx = getAudioContext();
  const TARGET_INTERVAL_MS = 1000 / 30;
  let lastFrameTime = 0;
  let rafHandle = 0;

  function tick(timestamp: number): void {
    rafHandle = requestAnimationFrame(tick);
    if (timestamp - lastFrameTime < TARGET_INTERVAL_MS) return;
    lastFrameTime = timestamp;

    const elapsed = ctx.currentTime - startCtxTime;
    const fraction = Math.min(1, elapsed / durationSec);
    const offset = CIRCUMFERENCE * (1 - fraction);
    circle.style.strokeDashoffset = String(offset);

    if (fraction >= 1) {
      cancelAnimationFrame(rafHandle);
      svg.remove();
      activeProgressMap.delete(index);
    }
  }

  rafHandle = requestAnimationFrame(tick);

  activeProgressMap.set(index, {
    stop: () => {
      cancelAnimationFrame(rafHandle);
      svg.remove();
    },
  });
}

export function stopPlaybackProgress(index: number): void {
  const prog = activeProgressMap.get(index);
  if (prog) {
    prog.stop();
    activeProgressMap.delete(index);
  }
}
```

### Pattern 3: player.ts Modification for startCtxTime

**What:** `playBlob()` currently does not expose the `startCtxTime` or `buffer.duration`. The playback progress module needs both. Two options:

Option A — Return from `playBlob`: Change signature to return `{ startCtxTime: number; durationSec: number }` after `source.start(0)`.

Option B — Pass a callback to `playBlob`: Add an optional `onStarted?: (startCtxTime: number, durationSec: number) => void` parameter called immediately after `source.start(0)`.

**Recommended:** Option B (callback) avoids changing the return type of the async function and keeps the caller pattern symmetric with the existing `onEnded` callback.

```typescript
// player.ts — updated playBlob signature
export async function playBlob(
  tileIndex: number,
  blob: Blob,
  onEnded: () => void,
  onStarted?: (startCtxTime: number, durationSec: number) => void,
): Promise<void> {
  // ... existing decode/cache logic ...
  source.start(0);
  const startCtxTime = ctx.currentTime; // capture AFTER start() — most accurate
  onStarted?.(startCtxTime, audioBuffer.duration);
}
```

### Pattern 4: main.ts Integration

**What:** Wire the viz start/stop into the three playback paths in `main.ts` and the two recording paths.

**Recording integration:**
- `has-sound` → start recording: call `startRecordingViz(index, stream)` after `startRecording(...)` returns
- Inside `onComplete` callback: call `stopRecordingViz(index)` before `transitionTile(appState, index, 'saving')`
- Inside `recording` → stop (manual tap): call `stopRecordingViz(index)` before `current.activeRecording?.stop()`

**Playback integration:**
- `has-sound` and `playing` tap handlers: pass `onStarted` callback to `playBlob`; inside `onStarted`, call `startPlaybackProgress(index, startCtxTime, durationSec)`
- `onEnded` callback: call `stopPlaybackProgress(index)` before `transitionTile`
- `playing` → re-tap: call `stopPlaybackProgress(index)` before `stopTile(index)` so ring is gone before restart

```typescript
// main.ts — has-sound tap handler (abbreviated)
await playBlob(index, record.blob,
  () => {
    // onEnded
    stopPlaybackProgress(index);
    transitionTile(appState, index, 'has-sound', { record });
    updateTile(index, appState.tiles[index]);
  },
  (startCtxTime, durationSec) => {
    // onStarted
    startPlaybackProgress(index, startCtxTime, durationSec);
  },
);
```

### CSS for Overlays

```css
/* Frequency bar canvas — absolute overlay filling the tile */
.tile-viz-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  border-radius: var(--radius);
}

/* Playback progress ring — centered absolute overlay */
.tile-progress-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 52px;
  height: 52px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  overflow: visible;
}
```

The tile already has `position: relative; overflow: hidden;` — the canvas fills the tile correctly. The SVG ring is centered and uses `overflow: visible` so stroke edges aren't clipped.

### Anti-Patterns to Avoid

- **Connecting `MediaStreamAudioSourceNode` to `ctx.destination` for mic viz:** iOS routes mic audio to speakers. Only connect `source → analyser`. The `MediaRecorder` captures audio from the `MediaStream` directly — it does not depend on the Web Audio graph.
- **Not disconnecting AnalyserNode on recording stop:** A dangling `MediaStreamAudioSourceNode` on iOS can hold the mic indicator active (the orange dot stays on). Always call `source.disconnect()` and `analyser.disconnect()` in ALL stop paths.
- **Using `getFloatTimeDomainData` on Safari:** This method does not exist on Safari's AnalyserNode. Use `getByteFrequencyData` (returns `Uint8Array` with values 0-255).
- **Calling `cancelAnimationFrame` only in one stop path:** There are three paths that can end recording (manual tap, auto-stop at 30s, error) and three that can end playback (manual re-tap, `onEnded`, error). Every path must call `stopRecordingViz` / `stopPlaybackProgress`.
- **Ignoring the 30fps cap:** Without a timestamp delta guard, on a 60Hz display each rAF frame triggers a canvas redraw at 60fps. iOS Low Power Mode throttles to 30fps anyway, but the explicit cap prevents battery drain on full-power mode.
- **Using `fftSize` > 64 for bar visualization:** Larger fftSize produces more frequency bins (half of fftSize). 64 → 32 bins → 12-16 visible bars fill the tile nicely. 256 → 128 bins, most of which are inaudible upper-frequency zeros for voice content.
- **Timing playback progress with `Date.now()` instead of `audioContext.currentTime`:** The AudioContext clock is synchronized to the audio hardware; `Date.now()` can drift. `audioContext.currentTime` is the correct master clock for audio-synchronized visuals.
- **Using `roundRect` without a fallback:** `CanvasRenderingContext2D.roundRect` is available on iOS 15.4+ Safari. If iOS 14 support is needed, use `fillRect` with flat corners instead, or add a feature check. The project targets iOS 14.3+, so check this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frequency data from mic | Custom PCM analysis, ScriptProcessorNode | `AnalyserNode.getByteFrequencyData()` | AnalyserNode is hardware-accelerated, runs off main thread; ScriptProcessorNode is deprecated and main-thread only |
| Audio timing / sync | `Date.now()` or `performance.now()` elapsed | `AudioContext.currentTime` | AudioContext clock is synchronized to the audio rendering hardware; `performance.now()` can drift vs actual audio output |
| Animation throttling | `setInterval` at 30Hz | `requestAnimationFrame` + timestamp delta guard | rAF is aligned to display refresh; `setInterval` can drift and fire off-screen; rAF auto-suspends when app is backgrounded |
| Progress ring drawing | Canvas arc drawing per-frame | SVG circle stroke-dashoffset | Changing `strokeDashoffset` CSS property triggers GPU compositing, not layout or paint; single attribute write per frame |
| Playback position | Custom `ScriptProcessorNode` to count samples | `(ctx.currentTime - startCtxTime) / buffer.duration` | No AudioWorklet needed; `currentTime` is accurate; `buffer.duration` is exact; formula is 1 line |

**Key insight:** iOS Safari enforces strict separation between `MediaRecorder` (which captures from the `MediaStream`) and the Web Audio analysis graph. You can read frequency data by connecting `createMediaStreamSource(stream)` to an `AnalyserNode` without routing audio to `destination` — the `MediaRecorder` captures from the stream independently.

## Common Pitfalls

### Pitfall 1: Mic-to-Speaker Feedback on iOS When Connecting to Destination

**What goes wrong:** The recording tile suddenly produces loud feedback (mic captured through speakers looped back). This happens because connecting `MediaStreamAudioSourceNode → analyser → ctx.destination` routes the live mic audio through the speaker.

**Why it happens:** iOS Safari's audio routing: when a `MediaStreamAudioSourceNode` output reaches `ctx.destination`, iOS plays it through the output device. The `MediaRecorder` does NOT require the Web Audio graph to reach destination — it records from the `MediaStream` directly.

**How to avoid:** Only connect `source.connect(analyser)`. Do NOT call `analyser.connect(ctx.destination)`. The analyser reads data without needing an output connection.

**Warning signs:** User hears echo/feedback during recording immediately after you add the AnalyserNode.

### Pitfall 2: `getFloatTimeDomainData` Missing on Safari

**What goes wrong:** `TypeError: analyser.getFloatTimeDomainData is not a function` on Safari. This kills the visualization for all iOS users.

**Why it happens:** WebKit does not implement `getFloatTimeDomainData`. MDN marks it as available but Safari has historically been inconsistent.

**How to avoid:** Use `getByteFrequencyData(Uint8Array)` — returns unsigned byte values 0-255 representing frequency magnitude. This is the correct method for bar-style visualization (per REQUIREMENTS.md: "Bar-Stil, kein Oszilloskop").

**Warning signs:** `TypeError` or blank visualization on iOS; works in Chrome but not Safari.

### Pitfall 3: Canvas Not Sized to Tile — Blurry or Clipped Bars

**What goes wrong:** The canvas renders at 300×150 (its default size), bars appear stretched or blurry, or only a fraction of the tile is covered.

**Why it happens:** Setting `canvas.style.width = '100%'` does not set the canvas drawing buffer size. The canvas element's `width` and `height` attributes must be set to the pixel dimensions of the tile (`getBoundingClientRect()`).

**How to avoid:** After appending the canvas to the tile, measure the tile via `getBoundingClientRect()` and set `canvas.width` and `canvas.height` to the integer pixel values. Also multiply by `window.devicePixelRatio` if sharp rendering on Retina is required (optional — the bars are large enough that 1x is acceptable).

**Warning signs:** Bars appear blurry or the canvas doesn't fill the tile.

### Pitfall 4: rAF Loop Not Cancelled in All Stop Paths

**What goes wrong:** The orange mic indicator on iOS stays lit after recording ends. The canvas remains on the tile. The frequency bars continue animating in a stopped state (all zeros after the mic stream stops).

**Why it happens:** The `onComplete` callback in `startRecording` is the primary stop path, but there are two others: manual user tap (recording state → saving) and auto-stop at 30s (inside recorder.ts timer). All three call `stopRecordingTimer()` — but if `stopRecordingViz(index)` is only wired to one path, the other paths leave the rAF loop and canvas orphaned.

**How to avoid:** Call `stopRecordingViz(index)` at the START of the `onComplete` callback (same place as `stopRecordingTimer()`). For the manual tap path in `main.ts`, call `stopRecordingViz(index)` before `current.activeRecording?.stop()`. Since `onComplete` fires in both manual and auto-stop paths, adding it to `onComplete` covers both; the manual tap path needs an additional call because it transitions to saving before `onComplete` fires.

**Warning signs:** Orange dot remains on iOS status bar after recording stops. Canvas with flat/zero bars visible on the saving tile.

### Pitfall 5: Playback Progress Ring Persists After Error

**What goes wrong:** The progress ring stays on the tile if `playBlob` throws (defective blob). The tile transitions to `error` state but the SVG ring is still visible.

**Why it happens:** The `try/catch` around `playBlob` in `main.ts` transitions to `error` state but does not call `stopPlaybackProgress`. The `onEnded` callback is never called on an error (the `AudioBufferSourceNode` never started).

**How to avoid:** Add `stopPlaybackProgress(index)` in the `catch` block of every `playBlob` call, alongside the `transitionTile(appState, index, 'error', ...)` call.

**Warning signs:** Progress ring visible on the error tile (red border, `!` icon, but ring overlay still showing).

### Pitfall 6: `roundRect` Not Available on iOS 14.x

**What goes wrong:** `TypeError: canvasCtx.roundRect is not a function` on iOS 14.x (supported from iOS 15.4).

**Why it happens:** `CanvasRenderingContext2D.roundRect` is a newer API. The project targets iOS 14.3+ per prior research.

**How to avoid:** Use a feature check: `if (canvasCtx.roundRect) { canvasCtx.roundRect(...) } else { canvasCtx.fillRect(...) }`. Or just use `fillRect` with square corners — the bar visualization reads fine without rounded corners.

**Warning signs:** Bars missing on iOS 14; no error on iOS 15+ Chrome/Safari.

### Pitfall 7: AnalyserNode on Paused/Suspended AudioContext

**What goes wrong:** `getByteFrequencyData` returns all zeros even though the mic is active.

**Why it happens:** The `AudioContext` may be in `suspended` state. On iOS, the context auto-suspends when the app is backgrounded or when there's no user gesture before audio operations.

**How to avoid:** `ensureAudioContextRunning()` is already called at the start of every `handleTileTap`. The recording viz is started after this call, so the context should be `running`. If the context is somehow suspended when `startRecordingViz` is called, add a `ctx.resume()` guard in `startRecordingViz` as a safety net.

**Warning signs:** Flat bars (all zero height) despite mic being active.

## Code Examples

### Full Frequency Bar Drawing Loop (30fps capped)

```typescript
// Source: MDN Visualizations with Web Audio API + project 30fps constraint
const TARGET_MS = 1000 / 30; // ~33.33ms
let last = 0;
let raf = 0;

function draw(ts: number): void {
  raf = requestAnimationFrame(draw);
  if (ts - last < TARGET_MS) return;
  last = ts;

  analyser.getByteFrequencyData(dataArray); // Uint8Array, values 0-255

  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  const BAR_COUNT = 12;
  const step = Math.floor(dataArray.length / BAR_COUNT);
  const barW = Math.floor((canvas.width - 8) / BAR_COUNT) - 2;

  for (let i = 0; i < BAR_COUNT; i++) {
    const v = dataArray[i * step] ?? 0;
    const barH = Math.max(3, Math.round((v / 255) * (canvas.height - 8)));
    const x = 4 + i * (barW + 2);
    const y = canvas.height - barH - 4;
    canvasCtx.fillStyle = `rgba(255,255,255,${0.4 + (v / 255) * 0.6})`;
    // Fallback for iOS 14: fillRect instead of roundRect
    canvasCtx.fillRect(x, y, barW, barH);
  }
}

raf = requestAnimationFrame(draw);
```

### Playback Progress Ring — SVG stroke-dashoffset

```typescript
// Source: MDN SVG stroke-dasharray/stroke-dashoffset; AudioContext.currentTime MDN
const RADIUS = 22;
const CIRCUM = 2 * Math.PI * RADIUS; // ~138.2px

// Each rAF frame:
const elapsed = ctx.currentTime - startCtxTime;
const fraction = Math.min(1, elapsed / durationSec);
circle.style.strokeDashoffset = String(CIRCUM * (1 - fraction));
// fraction=0 → full dashoffset → ring empty (0% progress)
// fraction=1 → dashoffset=0 → ring full (100% progress)
```

### Stop All Viz on Error (player.ts catch block pattern)

```typescript
// main.ts — catch block after playBlob
} catch (err: unknown) {
  stopPlaybackProgress(index); // CRITICAL: remove ring before error state render
  console.error('playBlob failed:', err);
  transitionTile(appState, index, 'error', {
    errorMessage: 'Wiedergabe fehlgeschlagen.',
    record,
  });
  updateTile(index, appState.tiles[index]);
}
```

### AnalyserNode Setup for Microphone (Safe for iOS — No Destination Connection)

```typescript
// Source: MDN AnalyserNode; Apple Developer Forum thread/91754 pattern
const ctx = getAudioContext(); // shared singleton — never create a new one
const analyser = ctx.createAnalyser();
analyser.fftSize = 64;
analyser.smoothingTimeConstant = 0.75;

const source = ctx.createMediaStreamSource(stream); // stream = cached mic stream
source.connect(analyser);
// analyser.connect(ctx.destination) → OMIT: would route mic to speakers on iOS

const dataArray = new Uint8Array(analyser.frequencyBinCount); // length = 32
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ScriptProcessorNode` for audio analysis | `AnalyserNode` (built-in) | Deprecated in 2014; AudioWorklet available 2018+ | `ScriptProcessorNode` is deprecated, runs on main thread, causes glitches; `AnalyserNode` is the correct modern approach; no AudioWorklet needed for visualization |
| `getFloatTimeDomainData` for waveform | `getByteFrequencyData` for bar visualization | Always; `getFloatTimeDomainData` missing on Safari | Bar style (REQUIREMENTS.md) requires frequency data; `getByteFrequencyData` works on all browsers including Safari |
| `webkitAudioContext` prefix | `AudioContext` | iOS 14.5+ / Safari 14.1+ dropped the prefix requirement | Project already uses unprefixed `AudioContext` via `player.ts`; no prefix needed |
| CSS animation for progress | rAF + `strokeDashoffset` write | N/A | CSS animation cannot be driven by real audio elapsed time; rAF + `currentTime` is the only approach for audio-synchronized progress |
| `roundRect` canvas API | `fillRect` with square corners | `roundRect` available iOS 15.4+ | Project targets iOS 14.3+; use `fillRect` for safe cross-version bars, or add feature check |

**Deprecated/outdated:**
- `ScriptProcessorNode`: deprecated; avoid entirely; `AnalyserNode` covers all visualization needs
- `webkitAudioContext`: no longer needed for iOS 14+; project already uses `AudioContext` directly
- `getFloatTimeDomainData`: not available on Safari; use `getByteFrequencyData` for bars

## Open Questions

1. **Does `MediaStreamAudioSourceNode` hold the mic indicator (orange dot) open even after recording ends if not disconnected?**
   - What we know: STATE.md explicitly flags "cancel RAF + disconnect nodes in ALL stop paths" and "orange mic dot left on iOS" as a known risk. Multiple community reports confirm that Web Audio nodes holding open mic streams can delay indicator removal.
   - What's unclear: Whether `source.disconnect()` alone is sufficient or whether `stream.getTracks().forEach(t => t.stop())` is also needed. The existing codebase caches the stream (`cachedStream`) and does NOT stop tracks — track stopping would break the cache and require re-permission.
   - Recommendation: Disconnect `analyser` and `source` nodes on stop (as shown in Pattern 1), but do NOT stop the stream tracks. If the orange dot persists in device testing, investigate whether `analyser.disconnect()` + `source.disconnect()` is sufficient. The codebase's stream cache design means track stopping is not an option.

2. **Is `CanvasRenderingContext2D.roundRect` safe to use?**
   - What we know: Available iOS 15.4+; missing iOS 14.x; project targets iOS 14.3+.
   - What's unclear: What percentage of users are on iOS 14 vs 15+.
   - Recommendation: Use `fillRect` (square corners) for the bars. The bar visualization reads clearly without rounded corners; it avoids the compatibility check entirely.

3. **Should the progress ring overlay the existing tile content (icon + label) or replace it during playback?**
   - What we know: The tile is `position: relative; overflow: hidden`. The SVG ring is centered with `position: absolute`. Existing content (icon, label, duration badge) remains visible under the ring.
   - What's unclear: Whether overlaying content looks cluttered on small tiles (~115px square on iPhone SE).
   - Recommendation: Keep existing content visible; make the ring semi-transparent (`rgba(255,255,255,0.85)` stroke). The ring circumference (r=22 → 44px diameter) is smaller than the tile, so it doesn't cover the label. If it looks cluttered on device, reduce `stroke-width` from 3 to 2.

## Sources

### Primary (HIGH confidence)

- Codebase: `/Users/rotmanov/git/private/soundboard/src/audio/player.ts` — confirmed shared `AudioContext` singleton pattern; `getAudioContext()` function; `activeNodes` and `audioBufferCache` maps; `source.start(0)` call location; `onEnded` callback pattern
- Codebase: `/Users/rotmanov/git/private/soundboard/src/audio/recorder.ts` — confirmed `cachedStream` pattern; `startRecording` returns `ActiveRecording.stop()`; recording stop paths (manual, auto-stop)
- Codebase: `/Users/rotmanov/git/private/soundboard/src/main.ts` — confirmed all 3 recording stop paths and all 3 playback stop paths; identified integration points for `startRecordingViz` / `stopRecordingViz` / `startPlaybackProgress` / `stopPlaybackProgress`
- Codebase: `/Users/rotmanov/git/private/soundboard/src/ui/tile.ts` — confirmed tile has `position: relative; overflow: hidden` (via CSS); canvas can be appended as child; SVG ring can be centered with `position: absolute`
- Codebase: `/Users/rotmanov/git/private/soundboard/src/style.css` — confirmed `.tile` CSS: `position: relative; overflow: hidden`; no existing `.tile-viz-canvas` or `.tile-progress-ring` classes
- MDN — AnalyserNode: `fftSize`, `frequencyBinCount`, `getByteFrequencyData`, `smoothingTimeConstant` — Baseline Widely Available; `getFloatTimeDomainData` noted as Safari-missing
- MDN — Visualizations with Web Audio API: standard bar visualization pattern with Canvas 2D + rAF
- MDN — AudioBufferSourceNode: no built-in `playbackPosition`; confirmed `start()` method
- MDN — BaseAudioContext.currentTime: read-only hardware timestamp; `elapsed = ctx.currentTime - startTime` pattern; iOS Safari supported
- `.planning/STATE.md` — locked constraint: "Cap RAF at 30fps; cancel RAF + disconnect nodes in ALL stop paths"

### Secondary (MEDIUM confidence)

- Apple Developer Forum thread/91754 — confirmed AnalyserNode + mic stream issues on iOS; `audioContext.resume()` as workaround for suspended context returning zeros
- dwayne.xyz/post/audio-visualizations-web-audio-api — confirmed `audioContext.resume()` fixes zero-data on Safari after non-user-gesture context creation; bar visualization pattern with `fftSize=256`, `smoothingTimeConstant=0.85`
- addpipe.com — AnalyserNode connection pattern `source → analyser → destination`; note: project intentionally OMITS `→ destination` to prevent iOS speaker feedback
- WebSearch — iOS Low Power Mode throttles rAF to 30fps; popmotion.io and motion.dev confirmed; timestamp delta guard recommended

### Tertiary (LOW confidence)

- WebSearch — `roundRect` available iOS 15.4+ / Safari 15.4: confirmed at MEDIUM confidence from MDN; recommendation is to use `fillRect` to avoid the issue entirely (LOW risk path)
- WebSearch — connecting `MediaStreamAudioSourceNode → destination` causes mic-to-speaker audio on iOS: confirmed from multiple forum reports (MEDIUM confidence); recommendation in Pattern 1 is to NOT connect to destination

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs verified against MDN official docs; all integration points verified against codebase read
- Architecture: HIGH — module structure derived directly from existing codebase patterns; all integration hooks identified from reading `main.ts`, `player.ts`, `recorder.ts`
- Pitfalls: HIGH — iOS-specific pitfalls cross-referenced with Apple Developer Forum reports and explicit STATE.md constraints; `getFloatTimeDomainData` missing on Safari is a documented browser compatibility issue

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days — stable Web Audio API; iOS Safari audio compatibility unlikely to change within this window)
