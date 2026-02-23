# Architecture Research

**Domain:** PWA Soundboard v1.1 — Feature Integration into Existing Vanilla TS Architecture
**Researched:** 2026-02-23
**Confidence:** HIGH (integration points, data model) / MEDIUM (iOS AnalyserNode, AudioBuffer export) / LOW (audio/mp4 re-encoding path)

---

## v1.1 Integration Overview

This document focuses on how 7 new features integrate with the existing v1.0 architecture. It extends (not replaces) the v1.0 ARCHITECTURE.md. The existing module boundaries are sound and should be preserved.

### Updated System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           UI Layer (DOM)                                  │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  TileView (×9)   [tile.ts]                                        │    │
│  │  - empty / recording / saving / has-sound / playing / error       │    │
│  │  - NEW: color badge (--tile-color from SlotRecord.color)          │    │
│  │  - NEW: duration badge (from SlotRecord.durationSeconds)  [done]  │    │
│  │  - NEW: progress bar overlay (playing state only)                 │    │
│  │  - NEW: canvas waveform overlay (recording state only)            │    │
│  └───────────────────────────┬──────────────────────────────────────┘    │
│                               │ tap / long-press                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  ActionSheet  [action-sheet.ts]                                   │    │
│  │  - existing: Re-record / Rename / Delete                          │    │
│  │  - NEW: Export button (triggers Web Share API)                    │    │
│  │  - NEW: Delete with confirmation (calls confirm-dialog.ts)        │    │
│  │  - NEW: color picker row                                          │    │
│  └───────────────────────────┬──────────────────────────────────────┘    │
│                               │ callbacks                                 │
├───────────────────────────────┼───────────────────────────────────────────┤
│                        State Controller  [state/store.ts]                  │
│   TileData adds: color?: string  (mirrored from SlotRecord)               │
│   SlotRecord adds: color?: string                                          │
├───────────────────────────────┬───────────────────────────────────────────┤
│                               │                                            │
│        ┌──────────────────────┼──────────────────┐                        │
│        ↓                      ↓                  ↓                         │
│  ┌───────────────┐  ┌──────────────────┐  ┌────────────────────────┐     │
│  │  audio/       │  │  storage/db.ts   │  │  NEW audio/trimmer.ts  │     │
│  │  recorder.ts  │  │  SlotRecord +=   │  │  AudioBuffer slice     │     │
│  │  + analyser   │  │  color?: string  │  │  → re-encode → Blob    │     │
│  │  node hookup  │  │                  │  │  (see TRIM-01 notes)   │     │
│  │               │  │                  │  └────────────────────────┘     │
│  │  player.ts    │  │                  │                                   │
│  │  + playback   │  │                  │  NEW audio/exporter.ts           │
│  │  start time   │  │                  │  navigator.share(file)            │
│  │  tracking     │  │                  │  + download fallback              │
│  └───────────────┘  └──────────────────┘                                  │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Feature-by-Feature Integration Analysis

### Feature 1: Waveform Visualizer During Recording (VIZ-01)

**What changes:** `recorder.ts` (NEW: export AnalyserNode), `tile.ts` (NEW: canvas overlay), `main.ts` (wire analyser → RAF loop)

**Integration approach:**

1. In `recorder.ts` — after `getMicrophoneStream()` returns a stream, create an `AnalyserNode` from the shared `AudioContext`, connect via `createMediaStreamSource(stream)`, and return it alongside the `ActiveRecording` handle.

2. In `main.ts` recording start block — receive the AnalyserNode, insert a `<canvas>` into the tile DOM (or inject it inside the `tile--recording` content built by `tile.ts`), run a `requestAnimationFrame` loop calling `analyser.getByteTimeDomainData()` and drawing to the canvas. Stop the loop in `onComplete`.

3. In `tile.ts` `buildTileContent` for state `'recording'` — add a `<canvas id="waveform-${index}">` element alongside the existing elapsed/remaining timers.

**iOS Safari constraint — MEDIUM confidence:** `AnalyserNode` connected to a `MediaStreamAudioSourceNode` has had known issues on iOS Safari (getByteTimeDomainData returning flat data in older WebKit builds). The known workaround is to connect the analyser to the existing shared `AudioContext` rather than creating a new context. Use `audioContext.createMediaStreamSource(stream)` where `audioContext` is the singleton from `player.ts` (via `getAudioContext()`). This is required — the iOS 4-context limit means a second AudioContext for recording is a hard blocker.

**Graceful degradation:** If `getByteTimeDomainData()` returns all-128 values (the flat-line iOS bug), the canvas draws a flat line — acceptable UX since the pulsing recording indicator still communicates activity. Do not block the recording flow on waveform failure.

**Files changed:**
| File | Change Type | What |
|------|------------|------|
| `src/audio/recorder.ts` | MODIFY | Export `AnalyserNode` from `getMicrophoneStream()` or `startRecording()`, connected to shared AudioContext |
| `src/ui/tile.ts` | MODIFY | Add `<canvas>` element to `'recording'` state content |
| `src/main.ts` | MODIFY | Start/stop RAF waveform loop in recording start/stop handlers |

**New files:** None — this is wiring of existing Web APIs within existing modules.

---

### Feature 2: Delete Confirmation Dialog (UX-01)

**What changes:** `action-sheet.ts` (change delete callback), new `ui/confirm-dialog.ts`

**Integration approach:**

1. Create `src/ui/confirm-dialog.ts` — a `showConfirmDialog(message): Promise<boolean>` function following the exact same `<dialog>` pattern used by `rename-dialog.ts`. Returns `true` on confirm, `false` on cancel.

2. In `action-sheet.ts`, wrap the existing `onDelete` callback: when the Delete button is clicked, close the action sheet, open the confirm dialog, and only call the real `onDelete()` callback if the user confirms.

3. Add `<dialog id="confirm-dialog">` to `index.html` with confirm/cancel buttons.

**iOS Safari constraint:** Same dialog pattern already proven in v1.0. No new constraints. Use `dialog.showModal()` not custom overlays. Clone-before-wire pattern already in `action-sheet.ts` prevents stale listener accumulation.

**Files changed:**
| File | Change Type | What |
|------|------------|------|
| `src/ui/action-sheet.ts` | MODIFY | Wrap onDelete to call confirm-dialog first |
| `index.html` | MODIFY | Add `<dialog id="confirm-dialog">` markup |

**New files:**
| File | What |
|------|------|
| `src/ui/confirm-dialog.ts` | `showConfirmDialog(message): Promise<boolean>` |

---

### Feature 3: Clip Duration Badge (UX-02)

**Status: Substantially already implemented.** `SlotRecord.durationSeconds` exists in `db.ts`. `tile.ts` `buildTileContent` already renders `<span class="tile-duration">` for `has-sound` state when `durationSeconds != null`. `main.ts` already saves `durationSeconds` on recording completion.

**Remaining gap:** The `'playing'` state's `buildTileContent` branch does not render the duration badge (it was stripped out). Minor fix to `tile.ts` to add duration display to the `'playing'` case as well, matching the `'has-sound'` case.

**Files changed:**
| File | Change Type | What |
|------|------------|------|
| `src/ui/tile.ts` | MODIFY | Add duration badge to `'playing'` case in `buildTileContent` |

**New files:** None.

---

### Feature 4: Playback Progress Indicator (UX-03)

**What changes:** `player.ts` (expose playback start time), `tile.ts` (render progress bar), `main.ts` (RAF loop for progress during playing state)

**Integration approach:**

The `AudioBufferSourceNode` does not expose a `currentTime` property. The standard pattern is to record `audioContext.currentTime` at `source.start(0)`, then compute progress as `(audioContext.currentTime - startTime) / audioBuffer.duration` in a RAF loop.

1. In `player.ts`, modify `playBlob()` to return the playback start time (`audioContext.currentTime` at the moment `source.start()` is called) and the total `audioBuffer.duration`. Alternatively, expose a `getPlaybackProgress(tileIndex): number | null` function that computes progress from stored state.

2. Preferred: export `getPlaybackInfo(tileIndex): { startedAt: number; duration: number } | null` from `player.ts`. Store `startedAt` and `duration` in the `activeNodes`-parallel map.

3. In `main.ts`, when transitioning to `'playing'`, start a RAF loop that calls `getPlaybackInfo()`, computes progress `0..1`, and updates a CSS custom property `--playback-progress` or a `<div class="tile-progress-bar">` width on the tile element. Cancel the RAF when transitioning back to `'has-sound'`.

4. In `tile.ts`, add `<div class="tile-progress-bar">` inside the `'playing'` state HTML. CSS sets width via inline style or CSS variable updated by the RAF loop.

**Design decision:** Drive progress from `audioContext.currentTime` (the audio clock), not from `Date.now()`. The audio clock does not drift under system load; `Date.now()` can.

**Files changed:**
| File | Change Type | What |
|------|------------|------|
| `src/audio/player.ts` | MODIFY | Track playback start time per tile; export `getPlaybackInfo()` |
| `src/ui/tile.ts` | MODIFY | Add progress bar element to `'playing'` state content |
| `src/main.ts` | MODIFY | Start/stop RAF progress loop in has-sound→playing / playing→has-sound transitions |

**New files:** None.

---

### Feature 5: Tile Colors (COLOR-01)

**What changes:** `storage/db.ts` (schema: add `color?`), `state/store.ts` (TileData: add `color?`), `tile.ts` (apply color), `action-sheet.ts` (color picker), `main.ts` (handleColorChange)

**Data model impact — this is the primary schema change for v1.1:**

```typescript
// storage/db.ts — updated SlotRecord
export interface SlotRecord {
  blob: Blob;
  mimeType: string;
  recordedAt: number;
  durationSeconds?: number;
  label?: string;
  color?: string;  // NEW: CSS color string e.g. '#FF6B6B', undefined = use index default
}
```

```typescript
// state/store.ts — updated TileData
export interface TileData {
  state: TileState;
  activeRecording?: ActiveRecording;
  record?: SlotRecord;
  errorMessage?: string;
  warningActive?: boolean;
  label?: string;
  color?: string;  // NEW: synced from SlotRecord.color, applied to --tile-color CSS var
}
```

**Backward compatibility:** `color` is `undefined` for all existing records. `tile.ts` `applyTileState` already calls `getTileColor(index)` as the default. The new behavior: if `tile.color` is set, use it; otherwise fall back to `getTileColor(index)`. Zero migration needed.

**Color picker UI:** Add a horizontal scrolling row of color swatches to the action sheet HTML (not a native `<input type="color">` — too large and visually inconsistent on iOS). A set of ~8 fixed swatches plus a "remove color" option is sufficient. Wire via `ActionSheetCallbacks.onColorChange(color: string | undefined)`.

**Persistence flow:** `handleColorChange` in `main.ts` → `loadSlot(index)` → `saveSlot(index, { ...record, color })` → `transitionTile` with updated color → `updateTile`.

**Files changed:**
| File | Change Type | What |
|------|------------|------|
| `src/storage/db.ts` | MODIFY | Add `color?: string` to `SlotRecord` |
| `src/state/store.ts` | MODIFY | Add `color?: string` to `TileData`; preserve color in transitions |
| `src/ui/tile.ts` | MODIFY | Use `tile.color ?? getTileColor(index)` in `applyTileState` |
| `src/ui/action-sheet.ts` | MODIFY | Add color swatch row; add `onColorChange` callback |
| `src/main.ts` | MODIFY | Add `handleColorChange()` handler, wire to action sheet |
| `index.html` | MODIFY | Add color swatch HTML inside `#action-sheet` |

**New files:** None — color picker is simple enough as inline HTML in the action sheet.

---

### Feature 6: Audio Trim (TRIM-01)

**What changes:** New `audio/trimmer.ts`, `main.ts` (wire trim action), `action-sheet.ts` (Trim button)

**What "trim" means here:** Per the milestone spec, trim is automatic — remove silence at start/end. This is NOT a timeline scrubber UI. Implementation uses amplitude threshold on the decoded `AudioBuffer`.

**Integration approach:**

1. `audio/trimmer.ts` — `trimAudio(buffer: AudioBuffer, threshold = 0.005): AudioBuffer`. Scans each channel's sample data (`buffer.getChannelData(c)`) to find the first and last sample above threshold. Creates a new `AudioBuffer` spanning only those samples using `ctx.createBuffer()` and copies channel data via `Float32Array` slices. Returns the trimmed `AudioBuffer`.

2. **The hard problem — re-encoding:** A trimmed `AudioBuffer` is PCM float32 in memory. To store it in IndexedDB as a `Blob`, it must be encoded. iOS Safari has no native `AudioBuffer → Blob` encoding path except via re-recording. Options ranked by viability:

   **Option A (recommended):** Re-encode to WAV in JavaScript. WAV encoding is trivial — write a 44-byte header + raw float32/int16 PCM samples. The result is a `.wav` Blob, fully decodable by `decodeAudioData` on iOS. Downside: WAV is large (~5 MB/min at 44100 Hz mono). For clips under 30 seconds this is ~2.5 MB maximum — acceptable for IndexedDB storage.

   **Option B:** Use `MediaRecorder` to re-record the trimmed audio by playing it through an `OfflineAudioContext` and piping to a `MediaStreamDestination`. Complex, timing-sensitive, known iOS bugs with `OfflineAudioContext` at non-standard sample rates.

   **Option C:** Use a WASM encoder (lamejs for mp3, opus-encoder). Adds ~300 KB bundle size. Overkill for this use case.

   **Verdict: Option A — WAV re-encoding in JS.** Confidence: MEDIUM. WAV is widely decodable, straightforward to implement, and avoids all WASM/OfflineAudioContext complexity on iOS.

3. After trim: save new Blob to IndexedDB (`saveSlot`), clear audio cache (`clearAudioCache`), update state and tile.

4. The action sheet gains a "Trim" button that triggers trim flow.

**Files changed:**
| File | Change Type | What |
|------|------------|------|
| `src/ui/action-sheet.ts` | MODIFY | Add Trim button and `onTrim` callback |
| `src/main.ts` | MODIFY | Add `handleTrim()` — decode → trim → WAV-encode → save |
| `index.html` | MODIFY | Add Trim button to action sheet markup |

**New files:**
| File | What |
|------|------|
| `src/audio/trimmer.ts` | `trimAudio(buffer, threshold): AudioBuffer` — silence detection and AudioBuffer slice |
| `src/audio/wav-encoder.ts` | `audioBufferToWav(buffer): Blob` — minimal WAV encoder (44-byte header + PCM int16 samples) |

**iOS Safari constraint:** `AudioContext.decodeAudioData` on iOS accepts WAV files. The WAV Blob will have `mimeType: 'audio/wav'`. Update `mimeType` field in the saved `SlotRecord` accordingly.

---

### Feature 7: Clip Export (SHARE-01)

**What changes:** `action-sheet.ts` (Export button), `main.ts` (handleExport), new `audio/exporter.ts`

**Integration approach:**

1. `audio/exporter.ts` — `exportClip(blob: Blob, mimeType: string, label?: string): Promise<void>`. Uses `navigator.canShare({ files: [file] })` to detect file sharing support. If supported, calls `navigator.share({ files: [file], title: label })`. Falls back to creating a temporary `<a href="objectURL" download="filename">` and simulating a click.

2. The file to share is the raw `blob` from `SlotRecord`. No re-encoding needed for export — share the original recording as-is. On iOS the blob is `audio/mp4` (AAC); the share sheet will show it to compatible apps.

3. **User gesture requirement:** `navigator.share()` must be called within a user gesture. The Export button tap IS a user gesture, but the action sheet `close()` → confirm dialog chain introduces `await`s that can expire the gesture context on iOS. Solution: call `exporter.exportClip()` directly inside the button click handler of the action sheet BEFORE any `await` or `dialog.close()` — or trigger export from the main tap handler without an intermediate dialog.

4. **`navigator.canShare()` fallback:** If `navigator.share` is undefined or `canShare` returns false (desktop browsers), use the download anchor approach. This gives a working export on desktop too.

**Files changed:**
| File | Change Type | What |
|------|------------|------|
| `src/ui/action-sheet.ts` | MODIFY | Add Export button and `onExport` callback |
| `src/main.ts` | MODIFY | Add `handleExport()` — call exporter.exportClip with tile's blob |
| `index.html` | MODIFY | Add Export button to action sheet markup |

**New files:**
| File | What |
|------|------|
| `src/audio/exporter.ts` | `exportClip(blob, mimeType, label): Promise<void>` — Web Share API + download fallback |

---

## Data Model Changes Summary

### SlotRecord (storage/db.ts) — v1.1 Schema

```typescript
export interface SlotRecord {
  blob: Blob;
  mimeType: string;       // existing
  recordedAt: number;     // existing
  durationSeconds?: number; // existing (added Phase 2)
  label?: string;         // existing
  color?: string;         // NEW in v1.1: user-chosen CSS color, undefined = use index default
}
```

**Migration:** None needed. All new fields are `?` optional. Existing records missing `color` fall back to the index-based `getTileColor(index)` default in `applyTileState`.

**TRIM-01 side effect:** After trimming, the saved record gets `mimeType: 'audio/wav'` instead of the original `'audio/mp4'` or `'audio/webm'`. `durationSeconds` must be recalculated from the trimmed `AudioBuffer.duration`.

### TileData (state/store.ts) — v1.1 Changes

```typescript
export interface TileData {
  state: TileState;
  activeRecording?: ActiveRecording;
  record?: SlotRecord;
  errorMessage?: string;
  warningActive?: boolean;
  label?: string;
  color?: string;  // NEW: synced from SlotRecord.color
}
```

The `transitionTile` function must be updated to preserve `color` in the `'has-sound'` and `'playing'` state branches (same pattern as `label`).

---

## Component Boundaries After v1.1

| Component | v1.0 Responsibility | v1.1 Additions |
|-----------|--------------------|-|
| `audio/recorder.ts` | MediaRecorder wrapper, emits Blob | Also creates + returns AnalyserNode connected to shared AudioContext |
| `audio/player.ts` | playBlob, stopTile, clearAudioCache | Also tracks playback start time; exports `getPlaybackInfo()` |
| `audio/trimmer.ts` | — | NEW: AudioBuffer silence detection and slice |
| `audio/wav-encoder.ts` | — | NEW: AudioBuffer → WAV Blob encoder |
| `audio/exporter.ts` | — | NEW: Web Share API + download fallback |
| `storage/db.ts` | idb-keyval CRUD | Schema: add `color?` to SlotRecord |
| `state/store.ts` | 9-slot state machine | TileData: add `color?`; transitionTile preserves color |
| `ui/tile.ts` | Render tile state | Add: progress bar (playing), waveform canvas (recording), user color |
| `ui/action-sheet.ts` | Re-record / Rename / Delete | Add: Export, Trim, color picker, delete-with-confirm |
| `ui/confirm-dialog.ts` | — | NEW: `showConfirmDialog(msg): Promise<boolean>` |
| `main.ts` | Orchestrates all events | Add handlers: handleExport, handleTrim, handleColorChange; RAF loops for waveform + progress |

---

## Recommended Build Order

Dependencies drive the order. Schema changes must land before features that read the new fields. Audio modules must exist before UI that calls them.

```
Phase order:

1. SlotRecord schema (color field)        → storage/db.ts
   TileData schema (color field)          → state/store.ts
   transitionTile color preservation      → state/store.ts
   Reason: All color-related features read from SlotRecord.color.
           Must be in place before tile rendering and action sheet changes.

2. confirm-dialog.ts (new module)         → ui/confirm-dialog.ts + index.html
   Delete confirmation wire-up            → ui/action-sheet.ts + main.ts
   Reason: Pure UI addition, no audio deps. Smallest change, validates dialog pattern.

3. Clip duration badge fix (playing state) → ui/tile.ts
   Reason: 1-line fix, already has data, no new deps.

4. Tile colors                            → ui/tile.ts + ui/action-sheet.ts + main.ts
   Reason: Depends on Step 1 schema. Color picker is UI-only after schema lands.

5. Playback progress indicator            → audio/player.ts + ui/tile.ts + main.ts
   Reason: Modifies player.ts and tile.ts. No schema deps. Isolated RAF loop.

6. Waveform visualizer                   → audio/recorder.ts + ui/tile.ts + main.ts
   Reason: Modifies recorder.ts. Must verify AnalyserNode on real iOS device
           before building further. iOS compat risk — validate early.

7. Audio trim                             → audio/trimmer.ts + audio/wav-encoder.ts
                                            + ui/action-sheet.ts + main.ts
   Reason: Most complex. New modules. WAV encoder is standalone.
           Trim result feeds into export (correct mimeType needed for exported file).

8. Clip export                           → audio/exporter.ts + ui/action-sheet.ts + main.ts
   Reason: Last because it benefits from correct mimeType after trim lands.
           Export of untrimmed clips still works without trim.
```

### Build Order Table

| Step | Feature | Files Modified | Files Created | Data Model Change |
|------|---------|---------------|---------------|-------------------|
| 1 | Schema: color field | `storage/db.ts`, `state/store.ts` | — | Yes — SlotRecord.color, TileData.color |
| 2 | Delete confirmation | `action-sheet.ts`, `main.ts`, `index.html` | `ui/confirm-dialog.ts` | No |
| 3 | Duration badge fix | `ui/tile.ts` | — | No |
| 4 | Tile colors | `ui/tile.ts`, `action-sheet.ts`, `main.ts`, `index.html` | — | Reads Step 1 |
| 5 | Playback progress | `audio/player.ts`, `ui/tile.ts`, `main.ts` | — | No |
| 6 | Waveform visualizer | `audio/recorder.ts`, `ui/tile.ts`, `main.ts` | — | No |
| 7 | Audio trim | `action-sheet.ts`, `main.ts`, `index.html` | `audio/trimmer.ts`, `audio/wav-encoder.ts` | Updates mimeType + durationSeconds on trim |
| 8 | Clip export | `action-sheet.ts`, `main.ts`, `index.html` | `audio/exporter.ts` | No |

---

## New Project Structure After v1.1

```
src/
├── audio/
│   ├── format.ts           # MIME type detection (unchanged)
│   ├── player.ts           # MODIFIED: +getPlaybackInfo()
│   ├── recorder.ts         # MODIFIED: +AnalyserNode from stream
│   ├── wake-lock.ts        # unchanged
│   ├── trimmer.ts          # NEW: AudioBuffer silence trim
│   ├── wav-encoder.ts      # NEW: AudioBuffer → WAV Blob
│   └── exporter.ts         # NEW: Web Share API + download fallback
├── input/
│   └── long-press.ts       # unchanged
├── state/
│   └── store.ts            # MODIFIED: +color to TileData
├── storage/
│   └── db.ts               # MODIFIED: +color to SlotRecord
├── ui/
│   ├── action-sheet.ts     # MODIFIED: +Export, Trim, color picker, confirm-delete
│   ├── confirm-dialog.ts   # NEW: showConfirmDialog()
│   ├── grid.ts             # unchanged
│   ├── haptic.ts           # unchanged
│   ├── install-banner.ts   # unchanged
│   ├── rename-dialog.ts    # unchanged
│   └── tile.ts             # MODIFIED: progress bar, waveform canvas, user color
├── main.ts                 # MODIFIED: all new handlers + RAF loops
└── style.css               # MODIFIED: progress bar, waveform canvas, color swatch styles
```

---

## iOS Safari Constraints for v1.1 Features

| Feature | Constraint | Mitigation |
|---------|-----------|------------|
| Waveform visualizer | AnalyserNode connected to MediaStreamSource may return flat data (128) on some iOS Safari versions | Draw flat line — graceful degradation; pulsing tile indicator still shows recording state |
| Waveform visualizer | Must use shared AudioContext singleton — not a new AudioContext | Use `getAudioContext()` from `player.ts` inside recorder.ts |
| Playback progress | AudioBufferSourceNode has no currentTime property | Track `audioContext.currentTime` at `source.start()`, compute progress in RAF loop |
| Audio trim | No native AudioBuffer → compressed Blob path on iOS | WAV encoder in JS — large but widely decodable; acceptable for <30s clips |
| Clip export | `navigator.share()` must fire within user gesture context | Call inside button click handler before any async `await` or dialog transitions |
| Clip export | `navigator.share({ files })` not available on all platforms | Guard with `navigator.canShare({ files })` before calling; download fallback otherwise |
| Delete confirm | `dialog.showModal()` from within an already-open dialog requires the first dialog to be closed first | Close action sheet before opening confirm dialog (already the pattern in action-sheet.ts) |
| All dialogs | iOS standalone PWA: `window.prompt()` is unreliable | Already avoided in v1.0 — custom `<dialog>` elements used throughout |

---

## Patterns to Follow

### Pattern: RAF Loop Management in main.ts

Both waveform and progress features require `requestAnimationFrame` loops tied to transient states (recording, playing). Use the same cleanup pattern:

```typescript
// Canonical pattern for managed RAF loops in main.ts
let waveformRafId: number | null = null;

function startWaveformLoop(analyser: AnalyserNode, canvas: HTMLCanvasElement): void {
  const data = new Uint8Array(analyser.frequencyBinCount);
  function draw() {
    analyser.getByteTimeDomainData(data);
    // ... draw to canvas ...
    waveformRafId = requestAnimationFrame(draw);
  }
  waveformRafId = requestAnimationFrame(draw);
}

function stopWaveformLoop(): void {
  if (waveformRafId !== null) {
    cancelAnimationFrame(waveformRafId);
    waveformRafId = null;
  }
}
// Stop in recording onComplete callback and in stopTile path
```

The same pattern applies to progress tracking. Both loops are cancelled in the state transition that ends the respective state (recording → saving, playing → has-sound).

### Pattern: WAV Encoder (Minimal, No Dependencies)

```typescript
// audio/wav-encoder.ts — canonical minimal PCM WAV encoder
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2; // int16
  const dataSize = numChannels * numSamples * bytesPerSample;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);           // PCM chunk size
  view.setUint16(20, 1, true);            // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);           // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleaved PCM samples (float32 → int16 clamp)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
```

### Pattern: Color Application in applyTileState

```typescript
// ui/tile.ts — updated applyTileState color logic
function applyTileState(el: HTMLElement, index: number, tile: TileData): void {
  // ...existing class logic...
  if (tile.state === 'has-sound' || tile.state === 'playing') {
    // User color takes precedence over index-based default
    const color = tile.color ?? getTileColor(index);
    el.style.setProperty('--tile-color', color);
  } else {
    el.style.removeProperty('--tile-color');
  }
  el.innerHTML = buildTileContent(index, tile);
}
```

---

## Anti-Patterns to Avoid in v1.1

### Anti-Pattern: Creating a Second AudioContext for the AnalyserNode

**What:** Creating `new AudioContext()` in `recorder.ts` to host the analyser.
**Why bad:** Hits iOS 4-context limit after 4 recording sessions. The analyser must connect to the same shared context as the player.
**Do instead:** Import `getAudioContext()` from `player.ts` into `recorder.ts`, or extract the singleton to a shared `audio/context.ts` module (recommended if the cross-import feels odd).

### Anti-Pattern: Blocking Recording on Waveform Availability

**What:** Throwing or refusing to start recording if `AnalyserNode.getByteTimeDomainData()` is unavailable.
**Why bad:** AnalyserNode has known iOS Safari issues. Recording is the core feature; visualization is enhancement.
**Do instead:** Graceful degradation — start recording regardless, draw flat line if data is flat.

### Anti-Pattern: Calling navigator.share() After an Awaited Operation

**What:** Awaiting `dialog.close()` or other promises before calling `navigator.share()`.
**Why bad:** iOS Safari considers the user gesture expired after any async await, even resolved ones. `navigator.share()` then throws `NotAllowedError`.
**Do instead:** Call `navigator.share()` synchronously inside the button click handler, or use the pattern where the async chain starts with `navigator.share()` before any other await.

### Anti-Pattern: Storing WAV Blobs Without Updating mimeType

**What:** After audio trim, saving the WAV Blob to IndexedDB but keeping `mimeType: 'audio/mp4'`.
**Why bad:** `decodeAudioData` on the next load will use the correct format regardless (it sniffs the binary header), but the `mimeType` field is also used by the exporter to name the file and detect format. Wrong MIME causes confusing behavior.
**Do instead:** Update `mimeType: 'audio/wav'` and recalculate `durationSeconds` from `AudioBuffer.duration` after trim, before calling `saveSlot`.

### Anti-Pattern: Using the CSS color picker (`<input type="color">`) for Tile Color Selection

**What:** Inserting `<input type="color">` in the action sheet.
**Why bad:** The native color picker on iOS opens a large modal wheel — jarring UX. It also doesn't fit the soundboard's minimal aesthetic.
**Do instead:** A fixed row of 8–10 color swatches as `<button>` elements with inline background colors. Simple, fast, matches the app's bold palette.

---

## Scaling Considerations

This remains a local-only single-screen PWA. v1.1 does not change the scaling model.

| Concern | v1.1 Impact | Approach |
|---------|-------------|----------|
| Memory | WAV blobs after trim are larger than AAC blobs (~10× for 30s) | Acceptable for <30s clips at 44100 Hz mono: max ~2.5 MB per slot, 22.5 MB total |
| RAF loop count | Max 2 concurrent loops: waveform (recording) + progress (playing) | RAF is idle when no recording or playback active; negligible impact |
| IndexedDB size | WAV trim replaces small AAC blob with larger WAV blob | Still well within iOS IndexedDB quota for personal use |
| AnalyserNode | One analyser node per recording session, released on stop | No accumulation; single recording at a time enforced by state machine |

---

## Sources

- [MDN: AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) — getByteTimeDomainData API, baseline widely available
- [MDN: Visualizations with Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) — canonical waveform visualization pattern
- [MDN: Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) — navigator.share, canShare
- [MDN: AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer) — copyFromChannel, getChannelData for trim implementation
- [MDN: AudioBufferSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode) — single-use node, no currentTime property
- [web.dev: Web Share API](https://web.dev/articles/web-share) — user gesture requirement, file sharing pattern
- [Apple Developer Forums: WebRTC Microphone AnalyserNode](https://developer.apple.com/forums/thread/91754) — iOS Safari AnalyserNode with getUserMedia limitations
- [Build with Matija: iPhone Safari MediaRecorder](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription) — iOS audio format constraints (v1.0 source, still applicable)
- [Sharing Files from iOS 15 Safari — Bits and Pieces](https://blog.bitsrc.io/sharing-files-from-ios-15-safari-to-apps-using-web-share-c0e8f6a4971) — Web Share API file sharing on iOS
- [LogRocket: Advanced Guide to Web Share API](https://blog.logrocket.com/advanced-guide-web-share-api-navigator-share/) — canShare() detection pattern, user gesture requirements

---
*Architecture research for: iPhone PWA Soundboard v1.1 feature integration*
*Researched: 2026-02-23*
