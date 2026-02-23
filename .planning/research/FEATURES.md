# Feature Research

**Domain:** Mobile soundboard PWA (personal, microphone-only, local storage) — v1.1 new capabilities
**Researched:** 2026-02-23
**Confidence:** HIGH (table stakes / anti-features) / MEDIUM (iOS-specific behavior, Web Share edge cases)

---

## Context: v1.1 Scope

v1.0 is shipped. This research covers the seven new features planned for v1.1:

1. Waveform visualizer during recording (VIZ-01)
2. Delete confirmation dialog (UX-01)
3. Clip duration badge on filled tiles (UX-02)
4. Playback progress indicator (UX-03)
5. Tile colors: user-selectable per tile (COLOR-01)
6. Audio trim: crop silence from start/end (TRIM-01)
7. Clip export via Web Share API / file download (SHARE-01)

Existing infrastructure available for these features: `getAudioContext()` (single shared AudioContext, never recreated), `audioBufferCache` (keyed by tile index), `activeNodes` (per-tile AudioBufferSourceNode), `TileData` state machine (empty → recording → saving → has-sound → playing), `IndexedDB` via idb-keyval, `MediaRecorder` (AAC/MP4 on iOS, Opus/WebM on Chrome).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that belong in v1.1 because their absence makes the app feel unfinished once the rest of v1.1 ships.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Delete confirmation dialog | Any destructive action on mobile needs confirmation; accidental long-press-then-delete is a real flow | LOW | Already has a `<dialog>` pattern (`rename-dialog.ts`, `clone-before-wire`). Native `<dialog>` element with "Delete" / "Cancel" buttons. Destructive button styled red but labeled clearly (not just color-coded). |
| Clip duration badge | Users record without knowing the length; a badge lets them calibrate; visible on the tile itself like every iOS voice memo | LOW | `AudioBuffer.duration` is available post-decode (already cached in `audioBufferCache`). Format as "2.4s". Update badge when sound is saved. Store duration in `SlotRecord` to avoid requiring AudioBuffer decode for display. |
| Playback progress indicator | Users playing a soundboard clip expect to know how far through the clip they are; native iOS apps all do this | MEDIUM | Ring (conic-gradient or SVG stroke-dashoffset) around tile border is the cleanest integration with existing tile shape. Bar at bottom of tile is an alternative. Requires a `requestAnimationFrame` loop during `playing` state. Calculate progress as `currentTime / duration`. |

### Differentiators (Features That Elevate v1.1)

Features worth building because they address real pain points or add clearly visible value beyond the baseline.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Waveform visualizer during recording | Proves the microphone is actually picking up audio; eliminates "am I being recorded?" anxiety; dominant pattern in all iOS voice memo / audio recorder apps | MEDIUM | Bar-style (frequency bars) is more readable on small tiles than oscilloscope. Use `AnalyserNode.getByteFrequencyData()` on the existing `AudioContext` (single instance, never recreate). Cap rAF at 30fps explicitly (`lastTime + 33ms` guard) to avoid battery drain on iOS. Canvas element overlaid or embedded in tile. Cannot use `timeslice` on MediaRecorder iOS (unreliable); AnalyserNode taps live stream directly instead. |
| Tile colors: user-selectable | Personal soundboards need quick visual navigation; color is faster than reading labels; 9 tiles is exactly the scale where color-as-identifier works | MEDIUM | Use `<input type="color">` — supported on iOS Safari since iOS 17 with native color picker UI. Offer a small preset palette (6-8 colors) above the native picker as shortcuts for speed. Store color per tile in `SlotRecord` (or a separate key in IndexedDB). Apply as CSS background with opacity or border color so label/state indicators remain readable. |
| Clip export via Web Share API | Users want to use their recorded clips outside the app; sending a voice memo is a very common use case | MEDIUM | `navigator.share({ files: [audioFile] })` works on iOS Safari 15+ for MP4/AAC files. **Use `navigator.canShare({ files })` before calling `navigator.share`** — required to avoid runtime errors. Fallback: create a temporary blob URL, programmatically click an `<a download>` element, then revoke the URL. In standalone PWA mode on iOS the share sheet fires normally (not a blocker). File name should reflect tile label or index: `sound-1.m4a`. |
| Audio trim: auto-crop silence | Recordings often start and end with silence (user reaction time, mic close-time); automatic trim makes clips shorter and more snappy | HIGH | Post-recording only (not real-time). Use `AudioBuffer.getChannelData()` (Float32Array of PCM samples). Walk from start until RMS exceeds a threshold (~-40 dBFS, or `Math.abs(sample) > 0.01` for fast heuristic), then from end inward. Threshold must be tunable — ambient noise varies significantly. Render trimmed result via `OfflineAudioContext` to a new AudioBuffer, then encode back to Blob. **iOS caveat: no native `AudioEncoder` / encode-back API yet; must use a library (e.g., `audio-encoder` or `extendable-media-recorder`) or save trimmed Float32Array as WAV (PCM, larger file).** This is the highest-complexity feature in v1.1. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Oscilloscope-style waveform (time-domain) | Looks cooler in videos | The oscilloscope centerline is at rest (visually looks "off") when no loud audio is present; users interpret flat line as "not recording"; bar visualizer (frequency domain) shows activity even for soft speech | Stick with bar-style frequency visualizer from `getByteFrequencyData()`. Always visually active when mic is open. |
| 60fps waveform animation | "Smoother is better" | iOS in Low Power Mode throttles `requestAnimationFrame` to 30fps. Running at 60fps in regular mode drains battery during a recording session (30s max). Human eye cannot distinguish 30fps from 60fps for bar animations. | Cap rAF at 30fps with a `lastTime` guard. Looks identical, uses half the GPU/CPU. |
| `timeslice` on MediaRecorder for real-time waveform | "More data = better visualization" | iOS Safari `MediaRecorder` with `timeslice` is unreliable (chunks arrive out of order or merged). Existing `recorder.ts` correctly avoids `timeslice` (comment: "Chunked recording with short timeslices is unreliable on iOS Safari"). | Tap the live `MediaStream` via `AnalyserNode` directly. Never touch `timeslice`. |
| Interactive waveform scrubber for trim | "Let the user manually drag trim points" | Needs a full waveform render (decode entire AudioBuffer, downsample to peaks, draw to canvas), two draggable handles, touch gesture handling — 3-5 days of work. For 30s clips with mostly-silence edges, auto-trim is almost always correct. | Auto-silence detection with a "trim preview" before confirm. If preview looks wrong, user can re-record. |
| Encode trimmed audio as MP4/AAC on iOS | "Keep the same file format" | Web Audio API has no `AudioEncoder` for MP4/AAC in Safari (as of early 2026). `MediaRecorder` cannot accept an `AudioBuffer` as input. Encoding back requires a WASM codec (lamejs, ffmpeg.wasm, etc.) — 4-8 MB download, compilation overhead. | Save trimmed audio as WAV (PCM) using a small pure-JS WAV encoder (~2 KB). WAV is larger (~5-8x) but iOS AudioContext plays it fine; for personal use over IndexedDB this is acceptable. Alternatively, skip re-encode entirely: store trim offsets in metadata and apply them at `source.start(offset, duration)` in the player. Offset-based trim is the best approach (zero encode cost). |
| Color wheel / full HSL picker | "I want exact control" | `<input type="color">` already opens the native iOS color wheel; adding a custom one is pure duplication. Custom color wheels on canvas require significant event handling for mobile touch. | Use `<input type="color">` as the "full picker" option, accessed by tapping a "more colors" swatch in the preset palette. |
| Waveform during playback | "Visualize the sound as it plays" | Requires an AnalyserNode in the playback graph (currently: source → destination). Would need to add AnalyserNode to `playBlob()` and run a separate rAF loop per playing tile. Added complexity for the recording-focused context. | Playback progress ring/bar is sufficient and simpler. Waveform-during-playback is a v2 concern if user feedback requests it. |

---

## Feature Dependencies

```
[Existing: AudioBuffer cache (player.ts:audioBufferCache)]
    └──required-by──> [Clip Duration Badge] (AudioBuffer.duration is already decoded)
    └──required-by──> [Audio Trim] (needs decoded PCM via getChannelData())
    └──required-by──> [Playback Progress] (needs AudioBuffer.duration for progress math)

[Existing: AudioContext (single instance, getAudioContext())]
    └──required-by──> [Waveform Visualizer] (AnalyserNode attaches to AudioContext)
    └──required-by──> [Audio Trim] (OfflineAudioContext for rendering trimmed result)

[Existing: MediaStream (getMicrophoneStream())]
    └──required-by──> [Waveform Visualizer] (source node from MediaStream → AnalyserNode)

[Existing: TileState machine (store.ts)]
    └──required-by──> [Playback Progress] (only animate in 'playing' state)
    └──required-by──> [Waveform Visualizer] (only run rAF loop in 'recording' state)
    └──required-by──> [Clip Duration Badge] (only visible in 'has-sound' and 'playing' states)

[Clip Duration Badge]
    └──enables──> [Playback Progress] (duration needed for progress fraction calculation)

[Existing: SlotRecord (IndexedDB)]
    └──requires-extension──> [Tile Colors] (add `color` field to SlotRecord)
    └──requires-extension──> [Clip Duration] (add `duration` field to SlotRecord)

[Audio Trim]
    └──produces──> [New Blob or Trim Offsets] (stored in SlotRecord; clears AudioBuffer cache)
    └──conflicts──> [Encode-back to MP4/AAC] (avoid; use offset metadata or WAV instead)

[Clip Export (Web Share API)]
    └──reads-from──> [SlotRecord.blob] (the raw recorded Blob from IndexedDB)
    └──fallback──> [<a download> Blob URL] (when navigator.canShare() returns false)
```

### Dependency Notes

- **Waveform visualizer requires AnalyserNode on the live MediaStream, not on MediaRecorder:** The existing `recorder.ts` does not pass the stream through an AnalyserNode. The visualizer needs to create `ctx.createMediaStreamSource(stream)` → `analyser` → nothing (not connected to destination, no playback). This is a recording-only node. Cancel the rAF loop and disconnect the AnalyserNode when recording stops.

- **Playback progress requires knowing AudioBuffer.duration at play-start:** `duration` is already available from the cached `AudioBuffer` in `audioBufferCache`. It should also be persisted in `SlotRecord` to avoid needing to decode before displaying the badge.

- **Audio trim with offset metadata (no re-encode) is the recommended path:** Store `trimStart` and `trimEnd` (seconds) in `SlotRecord`. In `playBlob()`, pass `source.start(0, trimStart, trimEnd - trimStart)`. This costs zero bytes and zero encode time. `AudioBufferSourceNode.start(when, offset, duration)` is supported on all platforms.

- **Tile color requires SlotRecord schema evolution:** `SlotRecord` currently stores `blob`, `mimeType`, `label`. Color needs a new field (`color?: string`). Because idb-keyval stores the full object, this is a non-breaking additive change — existing records without `color` will render with the default tile color.

- **Delete confirmation dialog conflicts with the existing action sheet flow:** Currently: long-press → action sheet → tap Delete. With confirmation: long-press → action sheet → tap Delete → confirmation dialog. The `clone-before-wire` pattern already used in `rename-dialog.ts` prevents stale event listeners on repeated modal shows.

---

## v1.1 MVP Definition

### Ship in v1.1

Features with clear iOS-verified feasibility and bounded complexity.

- [ ] Delete confirmation dialog — prevents irreversible accidental deletion; LOW complexity; reuses existing `<dialog>` pattern
- [ ] Clip duration badge — visible metadata that every audio app provides; LOW complexity; duration already available in cache
- [ ] Waveform visualizer during recording — removes "am I being recorded?" anxiety; MEDIUM complexity; AnalyserNode + Canvas + 30fps rAF
- [ ] Playback progress indicator — visual feedback during playback; MEDIUM complexity; conic-gradient ring or SVG stroke
- [ ] Tile colors — visual navigation aid; MEDIUM complexity; `<input type="color">` + preset palette + SlotRecord field

### Ship in v1.1 If Time Allows

- [ ] Clip export (Web Share API + download fallback) — MEDIUM complexity; requires `canShare()` check + blob URL fallback; worth shipping but can defer to v1.2 without breaking anything
- [ ] Audio trim (offset-based, no re-encode) — MEDIUM-HIGH complexity; AnalyserNode silence detection post-recording + `source.start(offset, duration)` playback; safest path avoids any encode; can defer to v1.2

### Defer to v1.2+

- [ ] Audio trim with waveform preview — HIGH complexity; interactive scrubber; wait for user demand
- [ ] Encode trimmed audio back to MP4 — HIGH complexity; needs WASM codec; marginal value given offset-based approach
- [ ] Waveform during playback — MEDIUM complexity; nice but not essential

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Delete confirmation dialog | HIGH (prevents data loss) | LOW | P1 |
| Clip duration badge | HIGH (expected by users) | LOW | P1 |
| Waveform visualizer (recording) | HIGH (validation of mic capture) | MEDIUM | P1 |
| Playback progress indicator | MEDIUM (feedback during play) | MEDIUM | P2 |
| Tile colors | MEDIUM (navigation aid) | MEDIUM | P2 |
| Clip export (Web Share + download) | MEDIUM (utility beyond app) | MEDIUM | P2 |
| Audio trim (offset-based) | MEDIUM (polish on recordings) | MEDIUM-HIGH | P2 |
| Interactive waveform scrubber | LOW (auto-trim sufficient) | HIGH | P3 |
| Waveform during playback | LOW (progress bar sufficient) | MEDIUM | P3 |

**Priority key:**
- P1: Must ship in v1.1
- P2: Ship in v1.1 if schedule allows; otherwise v1.2
- P3: Backlog

---

## iOS Safari Specifics: Per Feature

### VIZ-01: Waveform Visualizer

**Pattern:** Bar-style frequency bars (not oscilloscope). `AnalyserNode.getByteFrequencyData()` fills a `Uint8Array` of `fftSize / 2` frequency buckets. For a compact tile visualizer, `fftSize = 64` (32 bars) is sufficient and fast.

**Frame rate on iOS:** iOS Safari throttles `requestAnimationFrame` to 30fps in Low Power Mode. Design to 30fps (16.7ms budget) or cap explicitly to 33ms per frame. The visual difference at 30fps is imperceptible for bar animations.

**Connection pattern:**
```
getMicrophoneStream() → ctx.createMediaStreamSource(stream) → analyserNode → [NOT connected to destination]
```
Never connect analyserNode to destination (no playback echo). Disconnect and null the source node when recording stops to free GPU resources.

**Canvas sizing:** Use `devicePixelRatio` for crisp rendering on retina displays. Set `canvas.width = element.clientWidth * devicePixelRatio`. Draw bars with integer pixel widths to avoid sub-pixel anti-aliasing cost.

**Confidence:** HIGH — MDN AnalyserNode docs confirm this pattern. The existing `AudioContext` singleton and `getMicrophoneStream()` cache make hookup straightforward.

---

### UX-01: Delete Confirmation Dialog

**Pattern:** `<dialog>` element with "Cancel" and "Delete" buttons. "Delete" button colored red and labeled "Delete" (not "OK" or "Yes"). Focus trapped inside dialog. `dialog.showModal()` + `clone-before-wire` pattern from `rename-dialog.ts` to prevent listener accumulation.

**UX research finding:** Button text matters more than color — users in a hurry skip the message text and act on button labels. "Delete" is better than "Yes". Cancel button should be on the left (iOS standard: destructive on right, but "Cancel" closing rightward is fine given iOS convention expects destructive=right in action sheets; dialog is different context).

**Accessibility:** `<dialog>` provides focus trap and `role="dialog"` natively. Add `aria-labelledby` pointing to the dialog heading.

**Confidence:** HIGH — existing `<dialog>` usage in rename-dialog.ts confirms this pattern works in production on iOS Safari.

---

### UX-02: Clip Duration Badge

**Implementation:** `AudioBuffer.duration` returns seconds as a float. Format with one decimal: `${Math.round(duration * 10) / 10}s`. Persist the value in `SlotRecord` alongside the blob (additive field: `duration?: number`). Render as an absolutely-positioned badge in the corner of the tile.

**Where duration is available:** After `decodeAudioData()` in `player.ts:playBlob()` (first play), or after recording in `recorder.ts:onComplete()` (if we decode then). Best strategy: decode immediately after saving (in the save flow, not at play time), cache in `audioBufferCache`, persist duration in `SlotRecord`.

**Display states:** Show on `has-sound` and `playing` states. Hide on `empty`, `recording`, `saving`, `error`. During playback the badge can remain visible (not replaced by progress indicator — they serve different purposes).

**Confidence:** HIGH — `AudioBuffer.duration` is a standard Web Audio API property, supported everywhere.

---

### UX-03: Playback Progress Indicator

**Pattern options:**

- **Ring (recommended):** CSS `conic-gradient` border or SVG `stroke-dashoffset` ring around the tile. `conic-gradient` is supported on iOS Safari since iOS 12.1. Animate by updating a CSS custom property `--progress` from 0 to 1 each rAF frame.
- **Bar:** A thin bar at the bottom of the tile that fills left-to-right. Simpler to implement, less visually integrated with the circular tile design.

**Progress calculation:**
```
progress = (audioCtx.currentTime - playStartTime) / audioBuffer.duration
```
Store `playStartTime = audioContext.currentTime` at the moment `source.start(0)` is called. Use `requestAnimationFrame` loop while tile is in `playing` state. Cancel rAF on `onended` or manual stop.

**iOS note:** `AudioContext.currentTime` does not pause when the app is backgrounded (it continues incrementing). If the user backgrounds and returns, the progress ring may show completed. This is acceptable for a foreground-use soundboard.

**Ring implementation (conic-gradient approach):**
```css
.tile[data-state="playing"] {
  background: conic-gradient(var(--accent) calc(var(--progress, 0) * 360deg), transparent 0);
}
```
Update `--progress` via `tile.style.setProperty('--progress', String(fraction))`.

**Confidence:** MEDIUM — `conic-gradient` confirmed supported. Animation pattern via CSS custom property is well-established. iOS `AudioContext.currentTime` behavior is consistent with spec.

---

### COLOR-01: Tile Colors

**Input mechanism:** `<input type="color">` — supported on iOS Safari 17+ with native color wheel UI. In iOS 17, the native picker includes an eyedropper. In iOS 18.4+, it supports P3 gamut and alpha (alpha not needed here).

**UX flow:** Long-press → action sheet → "Change Color" → show a small popover with 8 preset swatches + a "Custom..." swatch that triggers `<input type="color">`. Presets cover the most common choices quickly; custom handles edge cases. Store selected color (hex string) in `SlotRecord.color`.

**Preset palette suggestion:** 8 colors from a warm/cool balance: red, orange, yellow, green, teal, blue, purple, pink. Defaults to the existing tile background color (no color = default).

**Rendering:** Apply color as `background-color` on the tile. Keep text/icons readable by using a fixed-contrast foreground (white or dark overlay depending on luminance of chosen color — can use simple lightness check: `luma = 0.299 * r + 0.587 * g + 0.114 * b`).

**Persistence:** `SlotRecord` schema change: add `color?: string` (optional hex). Existing records without this field render with the default color (no migration needed).

**Confidence:** MEDIUM — `<input type="color">` on iOS 17+ confirmed via WebKit blog. Behavior on iOS 14-16 may fall back to a limited picker; those users get the native but less polished version. This is acceptable since the app already targets iOS 14.3+ for MediaRecorder.

---

### TRIM-01: Audio Trim

**Recommended implementation: offset-based trim (no re-encode)**

Store `trimStart: number` and `trimEnd: number` (seconds) in `SlotRecord`. In `player.ts:playBlob()`, change:
```typescript
source.start(0);  // current
```
to:
```typescript
const start = record.trimStart ?? 0;
const duration = record.trimEnd != null ? record.trimEnd - start : undefined;
source.start(0, start, duration);
```

This approach:
- Zero cost: no encode, no new Blob, no WASM
- Lossless: original audio preserved; trim is non-destructive
- Compatible: `AudioBufferSourceNode.start(when, offset, duration)` is fully supported on iOS Safari

**Auto-silence detection algorithm:**
1. Get `Float32Array` from `audioBuffer.getChannelData(0)` (mono channel is sufficient)
2. Walk from start, find first frame where `Math.abs(sample) > SILENCE_THRESHOLD` (e.g., 0.01, tunable)
3. Walk from end, find last frame above threshold
4. Convert sample indices to seconds: `trimStart = firstActiveFrame / audioBuffer.sampleRate`
5. Add small padding: `trimStart = Math.max(0, trimStart - 0.05)` to avoid cutting the attack
6. Store in `SlotRecord`

**When to trigger:** Automatically after recording completes (offer a "Trim applied" toast with an "Undo" option). Do not require manual activation for the common case.

**Edge cases:**
- All silence (threshold never exceeded): do not trim — return `trimStart = 0, trimEnd = buffer.duration`
- Very noisy background: threshold produces bad trim — tune threshold conservatively (lower value = keep more audio = safer)
- Short clips (< 0.5s after trim): warn user, do not over-trim

**Alternative rejected: OfflineAudioContext render + WAV encode:**
Would produce a trimmed Float32Array renderable to a WAV blob using a pure-JS WAV writer (~40 lines). But WAV is ~5x larger than AAC for the same audio, and the offset approach is strictly better for this use case.

**Confidence:** MEDIUM — `AudioBufferSourceNode.start(when, offset, duration)` is standard and confirmed in MDN. The silence detection algorithm is a well-established pattern. The offset-based approach is novel but sound (no pun intended) — it avoids every known iOS encode pitfall.

---

### SHARE-01: Clip Export

**Web Share API — iOS behavior:**
- Supported since iOS 12.1 (text/URLs); file sharing via `navigator.share({ files })` supported since iOS 15.0 (Web Share Level 2)
- Works in both Safari browser mode and standalone PWA mode on iOS — no behavioral difference for file sharing
- For audio files: share an `audio/mp4` File object. Create with `new File([blob], 'sound-1.m4a', { type: blob.type })`
- **Always call `navigator.canShare({ files: [file] })` before `navigator.share()`** — required on iOS to validate file type support; skipping this causes silent failures

**Fallback (when `canShare()` returns false or API not available):**
```typescript
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'sound-1.m4a';
a.click();
URL.revokeObjectURL(url);
```
On iOS Safari, this triggers the share sheet or a "Save to Files" prompt rather than a file download (iOS does not download files to a visible Downloads folder from PWA context). Still useful.

**File naming:** Use tile label if set, else `sound-${index + 1}`. Extension: `.m4a` for `audio/mp4`, `.webm` for `audio/webm`.

**UX placement:** Add "Export" option to the long-press action sheet alongside Delete, Re-record, Rename.

**Confidence:** MEDIUM — Web Share Level 2 file sharing on iOS confirmed via multiple sources (firt.dev, MDN). The `canShare()` guard is documented as required. Standalone PWA mode behavioral parity confirmed.

---

## Competitor Feature Analysis

| Feature | GarageBand iOS (reference) | Voice Memos iOS (reference) | Our v1.1 Approach |
|---------|---------------------------|----------------------------|-------------------|
| Recording waveform | Real-time waveform (oscilloscope, tall) | Real-time waveform (bar-style, compact) | Bar-style in tile, 30fps, AnalyserNode |
| Silence trim | Auto-trim on stop (optional toggle) | Manual trim with waveform scrubber | Auto-trim with offset metadata, no scrubber |
| Clip duration | Always visible | Always visible (hh:mm:ss) | Badge on filled tile (seconds) |
| Playback progress | Timeline scrubber | Timeline scrubber + waveform | Ring or bar on tile face |
| Color coding | No (track colors, not button colors) | No | Preset palette + custom picker |
| Export / share | Full share sheet (audio files) | Share sheet (m4a) | Web Share API + download fallback |
| Delete confirmation | Yes (native iOS dialog pattern) | Yes | Yes (`<dialog>`) |

**Key observation:** Voice Memos (Apple's own app) uses bar-style waveform and auto-trim. This confirms our approach is the iOS-native expected pattern, not an unusual deviation.

---

## PWA-Specific Constraints for v1.1 Features

| Feature | Constraint | Mitigation |
|---------|------------|------------|
| Waveform visualizer | iOS rAF throttled to 30fps in Low Power Mode | Design to 30fps; imperceptible difference |
| Waveform visualizer | AnalyserNode requires AudioContext to be running | Call `ensureAudioContextRunning()` before creating MediaStreamSourceNode |
| Tile colors | `<input type="color">` UI on iOS 14-16 is limited (no eyedropper, smaller gamut) | Preset palette covers 90% of use cases; native picker is fallback |
| Clip export | `navigator.share()` must be called from a user gesture (tap event) | Trigger from the action sheet "Export" tap — already in a user gesture handler |
| Clip export | iOS 14: files sharing may not work in older Safari | `canShare()` check returns false → fallback to blob download |
| Audio trim | No AudioEncoder API on iOS Safari for MP4/AAC re-encode | Use offset metadata approach — no re-encode needed |
| Audio trim | `AudioBuffer.getChannelData()` returns a live Float32Array (view, not copy) | Copy to a new `Float32Array` if storing; or process inline immediately |
| Playback progress | AudioContext.currentTime continues during backgrounding | Accept minor drift; soundboard is foreground use only |

---

## Sources

- [MDN: AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) — frequency data API, `fftSize`, buffer sizing
- [MDN: Web Audio API Visualizations](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) — AnalyserNode + Canvas patterns
- [Motion Blog: When browsers throttle requestAnimationFrame](https://motion.dev/blog/when-browsers-throttle-requestanimationframe) — iOS Low Power Mode 30fps throttle confirmed
- [Popmotion: When iOS throttles requestAnimationFrame to 30fps](https://popmotion.io/blog/20180104-when-ios-throttles-requestanimationframe/) — iOS-specific rAF throttle detail
- [web.dev: Share Files pattern](https://web.dev/patterns/files/share-files/) — `canShare()` guard + blob URL fallback pattern
- [web.dev: Web Share API](https://web.dev/web-share/) — `navigator.share` usage and feature detection
- [firt.dev: iOS PWA Compatibility Notes](https://firt.dev/notes/pwa-ios/) — Web Share Level 2 supported since iOS 15.0
- [MagicBell: PWA iOS Limitations](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — standalone mode behavior confirmed
- [WebKit Blog: P3 and Alpha Color Pickers](https://webkit.org/blog/16900/p3-and-alpha-color-pickers/) — `<input type="color">` iOS 17+ native picker; iOS 18.4 P3/alpha support
- [Can I Use: input type=color](https://caniuse.com/input-color) — cross-browser support table
- [CSS-Tricks: Building a Progress Ring, Quickly](https://css-tricks.com/building-progress-ring-quickly/) — SVG stroke-dashoffset ring pattern
- [MDN: conic-gradient](https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/conic-gradient()) — browser support, animation via custom property
- [pavi2410.me: Detecting Silence Using Web Audio](https://pavi2410.me/blog/detect-silence-using-web-audio/) — AnalyserNode threshold-based silence detection algorithm
- [GitHub: mdn/content issue #32019](https://github.com/mdn/content/issues/32019) — Web Share file sharing iOS edge cases
- [UX Planet: Confirmation Dialogs](https://uxplanet.org/confirmation-dialogs-how-to-design-dialogues-without-irritation-7b4cf2599956) — button labeling best practices for destructive actions
- [MDN: AudioBufferSourceNode.start()](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start) — `start(when, offset, duration)` signature for offset-based trim

---

*Feature research for: iPhone PWA Soundboard v1.1 — new capabilities*
*Researched: 2026-02-23*
