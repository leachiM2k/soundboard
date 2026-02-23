# Stack Research

**Domain:** iPhone PWA Soundboard v1.1 — UX polish and new capabilities added to an existing v1.0 app
**Researched:** 2026-02-23
**Confidence:** HIGH (web platform APIs verified via MDN/WebKit; iOS-specific pitfalls confirmed via Apple Developer Forums and community reports)

---

## Context: No New Dependencies Required

The seven v1.1 features are fully implementable with **existing Web platform APIs already present in the project**. No new npm packages are needed. The existing stack (TypeScript 5.8.3, Vite 7.3.1, idb-keyval 6.2.2, vite-plugin-pwa 1.2.0) does not change.

| Feature | API Required | Already In Project? |
|---------|-------------|---------------------|
| Waveform visualizer | AnalyserNode, Canvas 2D | AudioContext exists in `src/audio/player.ts` |
| Delete confirmation dialog | HTMLDialogElement | Pattern established in `src/ui/rename-dialog.ts` |
| Clip duration badge | Existing `durationSeconds` in SlotRecord | Already in `src/storage/db.ts` |
| Playback progress indicator | CSS animation + JS timing | No new API |
| Tile colors | CSS custom properties + idb-keyval | idb-keyval already installed |
| Audio trim | AudioBuffer, createBuffer, getChannelData | AudioContext already in use |
| Clip export | Web Share API + URL.createObjectURL | Browser native |

---

## Recommended Stack

### Core Technologies — No Changes

| Technology | Version | Purpose | v1.1 Role |
|------------|---------|---------|-----------|
| TypeScript | 5.8.3 | Type safety | All new features typed inline |
| Vite | 7.3.1 | Build + dev server | No config changes needed |
| idb-keyval | 6.2.2 | IndexedDB storage | Store tile `color` field in existing SlotRecord |
| Web Audio API | Browser native | Audio pipeline | AnalyserNode for visualizer; AudioBuffer manipulation for trim |

### New Web APIs (No Installation — Browser Native)

| API | Purpose | iOS Safari Version Required |
|-----|---------|----------------------------|
| AnalyserNode | Real-time waveform data during recording | iOS 14.3+ (confirmed via WebKit; already required for MediaRecorder) |
| Canvas 2D (HTMLCanvasElement) | Render waveform as oscilloscope line | All target iOS versions |
| Web Share API Level 2 | Share audio file via iOS share sheet | iOS 15+ (Level 2 with file objects) |
| URL.createObjectURL | Blob-to-URL for file download fallback | All target iOS versions |
| CSS custom properties | Per-tile color theming | All target iOS versions |

---

## Feature-by-Feature Technical Decisions

### Feature 1: Waveform Visualizer During Recording

**APIs:** `AnalyserNode`, `Canvas 2D`, `MediaStream`, `requestAnimationFrame`

**Pattern (HIGH confidence — MDN official docs):**
```typescript
// Connect analyser to the existing cached MediaStream (NOT a clone)
const ctx = getAudioContext();           // reuse existing singleton from player.ts
const analyser = ctx.createAnalyser();
analyser.fftSize = 1024;                 // 512 data points — sufficient for a small tile canvas
const bufferLength = analyser.frequencyBinCount; // 512
const dataArray = new Uint8Array(bufferLength);

const source = ctx.createMediaStreamSource(stream); // stream from getMicrophoneStream()
source.connect(analyser);
// Do NOT connect analyser to ctx.destination — avoids mic feedback loop

// rAF draw loop
function draw() {
  rafId = requestAnimationFrame(draw);
  analyser.getByteTimeDomainData(dataArray);  // NOT getFloatTimeDomainData — see pitfall below
  // ... canvas draw
}

// Cleanup on recording stop
function stopVisualizer() {
  cancelAnimationFrame(rafId);
  source.disconnect();
  analyser.disconnect();
}
```

**Critical iOS Safari pitfall (MEDIUM confidence — Apple Developer Forums + Tone.js issues):**
`getFloatTimeDomainData()` is NOT available on older Safari/WebKit versions. Use `getByteTimeDomainData()` with a `Uint8Array` only. This is the 8-bit integer variant (values 0–255, center = 128) and works on all iOS targets.

**Known iOS 11-era bug — confirmed fixed in current iOS:** Older iOS Safari versions returned zero-filled arrays from `getByteTimeDomainData()` when using `createMediaStreamSource`. This bug is reported from iOS 11/12 era. Current iOS Safari (iOS 14.3+ which the project already requires) resolves this. However, stream isolation matters: do NOT reuse the same `MediaStream` object for both MediaRecorder and the AnalyserNode source. The `MediaRecorder` in `recorder.ts` already holds the stream; pass the same stream reference to `createMediaStreamSource` for the visualizer (do NOT call `stream.clone()`— cloning creates a second stream object and historically caused distortion in Safari).

**Connection topology:**
```
getUserMedia() stream
        ├── MediaRecorder (existing recorder.ts)
        └── MediaStreamAudioSourceNode → AnalyserNode → (dead end, NOT to destination)
```

**Canvas sizing:** Target 280×60 px (`width`/`height` attributes matching CSS display size) for a tile-width waveform. Use `devicePixelRatio` scaling for sharp rendering on Retina:
```typescript
canvas.width = displayWidth * devicePixelRatio;
canvas.height = displayHeight * devicePixelRatio;
ctx2d.scale(devicePixelRatio, devicePixelRatio);
```

**fftSize recommendation:** `1024` (not the MDN default of 2048) gives 512 data points. For a ~280px wide canvas that is one data point per 0.55 px — sufficient resolution for a live recording visualizer without unnecessary CPU cost. Lower to `512` (256 data points) if CPU usage is a concern on older iPhones.

---

### Feature 2: Delete Confirmation Dialog

**APIs:** `HTMLDialogElement` (already used for rename in `src/ui/rename-dialog.ts`)

**Pattern:** Reuse the existing clone-before-wire pattern established in `rename-dialog.ts`. No new API. Trivial.

---

### Feature 3: Clip Duration Badge

**APIs:** Existing `durationSeconds` field on `SlotRecord` (already in `src/storage/db.ts`)

Format with: `Math.round(durationSeconds)` + `'s'` for display. No new API. Trivial.

---

### Feature 4: Playback Progress Indicator

**APIs:** CSS + `AudioBufferSourceNode.context.currentTime` (already available via `getAudioContext()`)

**Two viable approaches:**

**Option A — SVG stroke-dashoffset ring (RECOMMENDED):**
Inline SVG `<circle>` with `stroke-dasharray = circumference` and `stroke-dashoffset` animated from `circumference → 0` over the clip duration. Update offset via `requestAnimationFrame` using `(elapsed / duration) * circumference`.

```css
/* Tile overlay ring — pure CSS, no library */
.progress-ring circle {
  stroke-dasharray: var(--circ); /* set via JS: 2πr */
  stroke-dashoffset: var(--offset); /* updated each rAF tick */
  transition: none; /* JS drives this, not CSS transition */
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
}
```

Advantages: resolution-independent, no additional DOM layers, integrates cleanly with existing tile `<div>` structure.

**Option B — CSS linear progress bar:**
A `<div>` with `width: 0%` animated to `100%` via `requestAnimationFrame`. Simpler to implement but visually less interesting than a ring. Use this if the ring adds too much complexity.

**Timing source:** `AudioContext.currentTime` (from existing `getAudioContext()`) gives sub-millisecond precision. Record `startTime = ctx.currentTime` at `source.start(0)`, compute `elapsed = ctx.currentTime - startTime` each rAF tick.

**Cleanup:** Cancel the rAF loop in the existing `source.onended` handler in `player.ts`.

---

### Feature 5: Tile Colors

**APIs:** CSS custom properties + idb-keyval (already installed)

**Storage:** Add optional `color?: string` field to `SlotRecord` in `src/storage/db.ts`. Store as a CSS color string (e.g., `'#e74c3c'`, `'hsl(120, 60%, 50%)'`). idb-keyval stores it transparently.

**Rendering:** Set `tile.style.setProperty('--tile-color', record.color ?? '#2c2c2e')` and use `background-color: var(--tile-color)` in CSS. This is purely a CSS concern — no new storage technology needed.

**Color picker:** Use `<input type="color">` (HTML native, no library). Works in iOS Safari. Present it from the existing long-press action sheet.

**No library needed.** Do not add a color-picker library for 9 tiles.

---

### Feature 6: Audio Trim

**APIs:** `AudioBuffer`, `BaseAudioContext.createBuffer()`, `AudioBuffer.getChannelData()`, `AudioBuffer.copyToChannel()`

**Pattern — pure vanilla (HIGH confidence — MDN):**

Audio trim works on the decoded `AudioBuffer` already in `audioBufferCache` in `player.ts`. No blob-level manipulation is needed — trim the AudioBuffer in memory, then re-encode to a Blob for storage.

```typescript
function trimSilence(
  buffer: AudioBuffer,
  threshold = 0.01,  // RMS amplitude considered "silence"
  ctx: AudioContext,
): AudioBuffer {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const data = buffer.getChannelData(0); // Use channel 0 for silence detection

  // Find first non-silent sample
  let start = 0;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold) { start = i; break; }
  }

  // Find last non-silent sample
  let end = data.length - 1;
  for (let i = data.length - 1; i >= 0; i--) {
    if (Math.abs(data[i]) > threshold) { end = i; break; }
  }

  const trimmedLength = end - start + 1;
  const trimmed = ctx.createBuffer(channels, trimmedLength, sampleRate);

  for (let c = 0; c < channels; c++) {
    const channelData = buffer.getChannelData(c);
    const slice = channelData.slice(start, end + 1);
    trimmed.copyToChannel(slice, c, 0);
  }
  return trimmed;
}
```

**Re-encoding to Blob:** After trimming the AudioBuffer, render it offline to get a new Blob for storage:
```typescript
const offlineCtx = new OfflineAudioContext(
  trimmed.numberOfChannels,
  trimmed.length,
  trimmed.sampleRate,
);
const src = offlineCtx.createBufferSource();
src.buffer = trimmed;
src.connect(offlineCtx.destination);
src.start();
const rendered = await offlineCtx.startRendering(); // → AudioBuffer
// rendered AudioBuffer → re-encode to Blob via MediaRecorder or WAV encoder
```

**Re-encoding limitation on iOS:** iOS Safari does not support `OfflineAudioContext` rendering back to a compressed format (no AudioEncoder API available as of 2025). The practical approach: store the trimmed AudioBuffer in `audioBufferCache` and use it for playback, but keep the original Blob in IndexedDB. For export (Feature 7), the trimmed AudioBuffer can be exported as WAV using a small inline PCM encoder (~30 lines, no library).

**Threshold recommendation:** `0.01` (linear amplitude, approximately -40 dBFS) for speech/sound recordings. This cuts genuine silence without clipping voiced sounds.

---

### Feature 7: Clip Export via Web Share API

**APIs:** `navigator.share()`, `navigator.canShare()`, `URL.createObjectURL()` (for download fallback), `File` constructor

**iOS Safari version gate:** Level 2 (file objects) requires iOS 15+. The project targets iOS 14.3+, so a fallback is mandatory.

**Pattern (MEDIUM confidence — web.dev + MDN + community reports):**
```typescript
async function exportClip(blob: Blob, filename: string): Promise<void> {
  // Convert Blob to File (required — canShare() checks File objects, not Blobs)
  const file = new File([blob], filename, { type: blob.type });

  // iOS Safari critical: files-ONLY — do NOT include title/text/url with files
  // Adding any other property alongside files causes silent failure on iOS
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file] });
  } else {
    // Fallback: trigger browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
```

**MIME type for iOS:** The audio recorded on iOS is `audio/mp4` (AAC). When sharing, the File object's MIME type should be `audio/mp4` and the filename extension `.m4a`. iOS share sheet identifies the file as an audio file and offers AirDrop, Messages, Files app, etc.

**Files-only constraint (HIGH confidence — confirmed by MDN issue #32019 and community):** On iOS Safari, `navigator.share({ files: [file], title: 'sound' })` silently drops the file and shares only the title. Use `{ files: [file] }` with no other properties for file sharing. If you want to share both a URL and a file, that requires two separate `share()` calls.

**Filename recommendation:** `soundboard-tile-{index}-{timestamp}.m4a` (for iOS/AAC blobs) or `.webm` (for Chrome/WebM blobs). Detect from `blob.type`.

**Standalone PWA mode:** `navigator.share()` works in standalone (home-screen) PWA mode on iOS. User gesture requirement still applies — must be called from a button tap handler.

---

## Installation

```bash
# No new packages needed for v1.1
# All features use existing dependencies and Web platform APIs
```

---

## Alternatives Considered

| Feature | Recommended | Alternative | Why Not |
|---------|-------------|-------------|---------|
| Waveform canvas | AnalyserNode + Canvas 2D (vanilla) | wavesurfer.js | 100 kB library for a feature that needs ~60 lines of vanilla code; wavesurfer has known iOS waveform bugs |
| Progress ring | Inline SVG + rAF (vanilla) | CSS @keyframes animation | CSS animation runs at fixed duration, not tied to actual AudioBuffer playback position; rAF reads `ctx.currentTime` for accuracy |
| Trim re-encode | Keep AudioBuffer in memory; WAV encode inline | audio-buffer-utils library | Library is 3+ years without updates; the needed operations (slice, copyToChannel) are 4 native API calls |
| Color storage | Add `color` field to existing SlotRecord | Separate IndexedDB key per tile | SlotRecord is already per-tile; adding a field is simpler than a parallel storage structure |
| Clip export | Web Share API + download fallback | Cordova/Capacitor file plugin | App is a PWA; no native shell; Web Share API covers the iOS share sheet natively |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `getFloatTimeDomainData()` | Not available in all Safari/WebKit versions; returns zeros on older iOS | `getByteTimeDomainData()` with `Uint8Array` |
| `stream.clone()` for AnalyserNode source | Historically caused audio distortion in Safari when cloned stream is passed to MediaStreamAudioSourceNode | Pass the original stream reference to both MediaRecorder and createMediaStreamSource |
| `navigator.share({ files, title, text })` combined | iOS Safari silently drops files when other properties are included | `{ files: [file] }` only for file sharing |
| `OfflineAudioContext` for re-encoding to AAC/MP4 | No Web Audio → compressed format rendering on iOS Safari | Store original Blob for playback; use AudioBuffer only in memory; export as WAV or use original blob for share |
| `wavesurfer.js` | 100 kB+ library with known iOS Safari waveform bugs; last major release 2023; overkill for a recording indicator | 60 lines of vanilla Canvas + AnalyserNode |
| `input type="color"` opened programmatically without a user gesture | Safari blocks programmatic `.click()` on `<input type="color">` | Trigger from within the long-press action-sheet button tap handler |
| Adding color to a separate idb-keyval store key | Increases storage call complexity | Add optional `color?: string` field to existing `SlotRecord` |

---

## Stack Patterns by Variant

**If iOS 14.3–14.4 users must be supported (no Web Share Level 2):**
- `navigator.canShare()` returns false for files on these versions
- Download fallback via `URL.createObjectURL + <a download>` activates automatically
- All other v1.1 features work on iOS 14.3+

**If audio trim needs to persist across app restarts:**
- Cannot store trimmed AudioBuffer directly (not serializable)
- Must re-encode: either keep original Blob + trimPoints metadata, or encode trimmed PCM to WAV Blob
- WAV Blob approach: inline Float32→PCM encoder (~30 lines), store new Blob in IndexedDB, update `durationSeconds`
- The PCM WAV encoder is the recommended path — no library, ~30 lines of TypeScript

**If waveform data returns all zeros on a user's device:**
- Indicates WebKit bug (pre-iOS 14.3) or AudioContext suspended state
- Guard: if `dataArray.every(v => v === 128)` (silence baseline), render a flat line — not a blank canvas
- This graceful fallback is preferable to showing nothing

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| TypeScript 5.8.3 | All v1.1 features | No TS version change needed |
| idb-keyval 6.2.2 | Adding `color` field to SlotRecord | Transparent: idb-keyval stores the full object as-is |
| vite-plugin-pwa 1.2.0 | No precache changes for v1.1 | Canvas/SVG elements are inline; no new static assets to precache |
| Web Share API Level 2 | iOS 15+, Chrome 89+ | iOS 14.x falls through to download fallback |
| AnalyserNode getByteTimeDomainData | iOS 14.3+ (all WebKit targets) | Float variant is NOT reliable; byte variant is safe |

---

## Sources

- [MDN — Web Audio API Visualizations](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) — AnalyserNode + Canvas exact pattern (HIGH confidence)
- [MDN — AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) — fftSize, frequencyBinCount, getByteTimeDomainData API (HIGH confidence)
- [MDN — AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer) — getChannelData, copyToChannel for trim (HIGH confidence)
- [MDN — Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) — navigator.share, canShare API (HIGH confidence)
- [web.dev — Integrate with the OS sharing UI](https://web.dev/articles/web-share) — File sharing pattern, canShare({ files }) usage (HIGH confidence)
- [GitHub MDN content issue #32019](https://github.com/mdn/content/issues/32019) — Confirmed iOS files-only constraint: no title/text alongside files (HIGH confidence)
- [Tone.js issue #129 — getFloatTimeDomainData does not exist in Safari](https://github.com/Tonejs/Tone.js/issues/129) — Safari missing float variant (MEDIUM confidence)
- [Apple Developer Forums — WebRTC Microphone Audio AnalyserNode](https://developer.apple.com/forums/thread/91754) — iOS AnalyserNode zero-fill issue (MEDIUM confidence; pre-iOS 14.3 era bug)
- [CSS-Tricks — Building a Progress Ring Quickly](https://css-tricks.com/building-progress-ring-quickly/) — SVG stroke-dashoffset pattern (HIGH confidence)
- [WebKit blog — MediaRecorder API](https://webkit.org/blog/11353/mediarecorder-api/) — iOS audio/mp4 is the only supported format (HIGH confidence)
- [GitHub — audiojs/audio-buffer-utils](https://github.com/audiojs/audio-buffer-utils) — Trim/slice pattern reviewed; decided against as dependency (MEDIUM confidence)

---

*Stack research for: iPhone PWA Soundboard v1.1 — UX Polish + New Capabilities*
*Researched: 2026-02-23*
