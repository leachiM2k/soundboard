# Project Research Summary

**Project:** iPhone PWA Soundboard v1.1 — UX Polish and New Capabilities
**Domain:** Mobile PWA / Web Audio API / iOS Safari
**Researched:** 2026-02-23
**Confidence:** HIGH

## Executive Summary

v1.1 adds seven features to an already-shipped v1.0 soundboard: waveform visualizer, delete confirmation dialog, clip duration badge, playback progress indicator, tile colors, audio trim, and clip export. The dominant research finding is that all seven features are implementable entirely with existing Web platform APIs already present in the project — no new npm packages are needed. The existing stack (TypeScript 5.8.3, Vite 7.3.1, idb-keyval 6.2.2, vite-plugin-pwa 1.2.0) remains unchanged. Four new source files will be created (`audio/trimmer.ts`, `audio/wav-encoder.ts`, `audio/exporter.ts`, `ui/confirm-dialog.ts`); the rest is targeted modification of existing modules.

The recommended approach is additive: extend `SlotRecord` with an optional `color?` field (non-breaking, no migration needed), wire `AnalyserNode` into the existing single `AudioContext` singleton for live waveform visualization, drive progress tracking via `audioContext.currentTime`, implement trim as offset metadata via `AudioBufferSourceNode.start(when, offset, duration)` (zero encode cost, non-destructive), and export via Web Share API with a `<a download>` fallback. The two highest-complexity items — audio trim and clip export — are independently deferrable to v1.2 without breaking the v1.1 story. The five P1 features (delete confirmation, duration badge, waveform visualizer, playback progress, tile colors) form a complete shippable v1.1.

The key risks cluster around iOS Safari constraints: the 4-AudioContext limit mandates using the shared singleton; `AnalyserNode.getByteTimeDomainData()` must be used instead of the float variant; `requestAnimationFrame` must be capped at 30fps to prevent thermal throttling on older iPhones; `navigator.share()` must be called synchronously within the user gesture (no `await` before it); and WAV re-encoding (not AAC) is the only viable path for persisting trimmed audio because iOS Safari has no `encodeAudioData` API. All of these have verified mitigations documented in the research.

## Key Findings

### Recommended Stack

No new dependencies. All v1.1 features use browser-native APIs on top of the existing stack. The single most important stack constraint for v1.1 is the iOS 4-AudioContext limit: the `AnalyserNode` for waveform visualization must connect to the existing `AudioContext` singleton from `player.ts` — not a new context. This requires either importing `getAudioContext()` into `recorder.ts` or extracting the singleton to a shared `audio/context.ts` module.

**Core technologies (unchanged from v1.0):**
- TypeScript 5.8.3: all new features typed inline; no version change needed
- Vite 7.3.1: no config changes required for v1.1
- idb-keyval 6.2.2: stores the extended `SlotRecord` transparently; new optional `color?` field requires no migration
- Web Audio API (AnalyserNode, AudioBuffer): waveform visualization and trim silence detection — already in project
- Canvas 2D API: waveform rendering at 30fps with `devicePixelRatio` scaling — browser native

**New browser-native APIs (no installation):**
- Web Share API Level 2 (`navigator.share({ files })`): clip export on iOS 15+; download fallback for iOS 14.x
- CSS custom properties: per-tile color theming — all target iOS versions

**What NOT to use:**
- `getFloatTimeDomainData()` — not available on all Safari/WebKit targets; use `getByteTimeDomainData()` with `Uint8Array`
- `stream.clone()` for AnalyserNode — historically caused audio distortion in Safari; pass the original stream reference
- `navigator.share({ files, title })` combined — iOS Safari silently drops files when other properties are included
- `wavesurfer.js` or any audio library — 100+ kB for functionality achievable in ~60 lines of vanilla code
- `<input type="color">` in the action sheet — native iOS picker is too large and visually jarring; use a preset swatch row

### Expected Features

**Must have (table stakes) — P1, ship in v1.1:**
- Delete confirmation dialog — prevents irreversible accidental deletion; reuses existing `<dialog>` pattern from `rename-dialog.ts`; LOW complexity
- Clip duration badge (playing state fix) — expected by users; `durationSeconds` already in `SlotRecord`; LOW complexity (1-line fix in `tile.ts`)
- Waveform visualizer during recording — removes "am I being recorded?" anxiety; bar-style frequency visualizer (not oscilloscope); MEDIUM complexity

**Should have (differentiators) — P2, ship in v1.1 if schedule allows:**
- Playback progress indicator — ring or bar driven by `audioContext.currentTime`; MEDIUM complexity
- Tile colors — preset palette of 8 swatches + optional `SlotRecord.color` field; MEDIUM complexity
- Clip export (Web Share API + download fallback) — MEDIUM complexity; can defer to v1.2
- Audio trim (offset-based, no re-encode) — MEDIUM-HIGH complexity; `source.start(0, trimStart, duration)`; can defer to v1.2

**Defer to v2+:**
- Interactive waveform scrubber for trim — 3-5 days of work; auto-trim covers most use cases
- Encode trimmed audio back to MP4/AAC — requires WASM codec; offset-based approach is strictly better
- Waveform during playback — progress indicator is sufficient; out-of-scope for v1.1

**Anti-features confirmed by research:**
- 60fps waveform animation — iOS throttles rAF to 30fps in Low Power Mode; cap at 30fps, imperceptible difference
- `timeslice` on MediaRecorder for waveform — unreliable on iOS Safari; existing `recorder.ts` correctly avoids it
- Oscilloscope-style (time-domain) waveform — looks inactive with quiet audio; bar-style frequency visualizer always shows activity

### Architecture Approach

v1.1 is a surgical extension of the existing v1.0 module boundaries, which are sound and should be preserved. The dominant patterns are: new capabilities hook into existing state-machine transitions in `main.ts` via RAF loops; new `<dialog>` elements follow the `clone-before-wire` pattern established by `rename-dialog.ts`; data model changes are additive optional fields on `SlotRecord`; and new audio modules (`trimmer.ts`, `wav-encoder.ts`, `exporter.ts`) are standalone with no circular dependencies.

**Components and v1.1 changes:**

| Component | v1.0 Role | v1.1 Change |
|-----------|-----------|-------------|
| `audio/recorder.ts` | MediaRecorder wrapper | MODIFIED: creates and returns `AnalyserNode` from shared `AudioContext` |
| `audio/player.ts` | playBlob, stopTile, cache | MODIFIED: tracks `startedAt`/`duration` per tile; exports `getPlaybackInfo()` |
| `audio/trimmer.ts` | — | NEW: silence detection via amplitude threshold on `AudioBuffer.getChannelData()` |
| `audio/wav-encoder.ts` | — | NEW: RIFF WAV encoder (~44-byte header + int16 PCM; ~30 lines; no deps) |
| `audio/exporter.ts` | — | NEW: `navigator.share({ files })` with `canShare()` guard + `<a download>` fallback |
| `storage/db.ts` | idb-keyval CRUD | MODIFIED: adds `color?: string` to `SlotRecord` (non-breaking) |
| `state/store.ts` | 9-slot state machine | MODIFIED: adds `color?: string` to `TileData`; `transitionTile` preserves color |
| `ui/tile.ts` | Render tile state | MODIFIED: progress bar (playing), waveform canvas (recording), user color via CSS var |
| `ui/action-sheet.ts` | Re-record / Rename / Delete | MODIFIED: Export, Trim, color swatch row, confirm-delete wrapper |
| `ui/confirm-dialog.ts` | — | NEW: `showConfirmDialog(message): Promise<boolean>` |
| `main.ts` | Orchestrates all events | MODIFIED: RAF loops for waveform + progress; handlers for export, trim, color change |

**Architecture-mandated build order:**
Schema first (db.ts, store.ts) → confirm dialog → duration badge fix → tile colors → playback progress → waveform visualizer → audio trim → clip export

### Critical Pitfalls

**v1.1-specific (highest risk):**

1. **AnalyserNode connected to wrong AudioContext** — Creating a second `AudioContext` for the AnalyserNode hits the iOS 4-context limit after 4 recording sessions. Use `getAudioContext()` from `player.ts` inside `recorder.ts`; connect via `ctx.createMediaStreamSource(stream)`; do NOT connect to `ctx.destination` (causes mic feedback loop).

2. **RAF loops not cleaned up after recording or playback stops** — The orange iOS mic indicator persists in the status bar; CPU drain continues between sessions. Must call `cancelAnimationFrame(rafId)`, `micSource.disconnect()`, and `analyserNode.disconnect()` in ALL stop paths: manual stop, 30s auto-stop, and error paths.

3. **`navigator.share()` called after an `await`** — iOS Safari considers transient activation expired after any `await` boundary; throws `NotAllowedError`. Pre-load the blob from `SlotRecord` before the gesture fires; call `navigator.share()` synchronously from the button click handler with no intermediate awaits.

4. **Stale `AudioBuffer` cache after trim** — Saving a trimmed WAV blob without calling `clearAudioCache(index)` causes the next tap to play the old untrimmed audio from the in-memory cache. `clearAudioCache(index)` must be called immediately after every `saveSlot` that replaces a blob.

5. **AAC encoder priming frames cause over-trimming of quiet recordings** — iOS AAC encoder inserts 1024-2048 silent priming samples at the start of every recording. A naive threshold scan will find the first real audio a few milliseconds late — acceptable for loud content but may clip the attack of whispered sounds. Skip first 1024 samples before scanning; use threshold 0.005–0.01; enforce a minimum viable clip length (>0.1s) to prevent over-trimming.

**v1.0 pitfalls still relevant to v1.1 operation:**

6. **`AudioContext` in `"interrupted"` state** — Phone calls and backgrounding suspend the context. Already handled in v1.0 via `visibilitychange` listener; must not be broken by v1.1 changes to `recorder.ts` or `player.ts`.

7. **`SlotRecord` backward compatibility** — Existing v1.0 records will not have `color`, `trimStart`, or `trimEnd`. Every consumer of new fields must use `record.color ?? defaultValue`; never assume field presence. Validate stored colors with `CSS.supports('color', value)` before applying to style.

## Implications for Roadmap

Based on research, the architecture specifies a clear 8-step build order driven by schema dependencies and iOS verification risk. The recommended phase grouping collapses these into 3 delivery phases:

### Phase 1: Foundation — Schema, Dialog, Badge

**Rationale:** Schema changes must land before any feature reads the new fields. Delete confirmation and duration badge are the lowest-risk changes and validate the `<dialog>` pattern before the more complex RAF-driven features. These are fully unblocked — no new APIs, no iOS verification risk.

**Delivers:** Non-destructive delete flow, visible clip duration on all tile states, `SlotRecord.color` field ready for Phase 2

**Implements:**
- `SlotRecord.color?: string` in `storage/db.ts`; `TileData.color?: string` in `state/store.ts`; `transitionTile` color preservation
- `ui/confirm-dialog.ts` (new) — `showConfirmDialog(message): Promise<boolean>`
- Delete confirmation wire-up in `action-sheet.ts` and `main.ts`
- Duration badge fix in `tile.ts` (add to `'playing'` state branch — currently missing)

**Avoids:** SlotRecord backward-compatibility pitfall — establishes the `?? defaultValue` optional field pattern before tile color consumers land

**Research flag:** Standard patterns. `<dialog>` is proven in production v1.0; `durationSeconds` already in `SlotRecord`; straightforward additive changes. No research needed.

### Phase 2: Visual Feedback — Waveform, Progress, Color

**Rationale:** All three features modify `tile.ts` and `main.ts` together, so batching them minimizes merge complexity. Waveform visualizer carries the highest iOS verification risk of any v1.1 feature (AnalyserNode on live MediaStream); it must be tested on real hardware before shipping. Progress indicator and tile colors have lower risk and can ship in parallel.

**Delivers:** Live waveform during recording, progress ring/bar during playback, per-tile color identity — the full "this app feels polished" moment for v1.1

**Implements:**
- Waveform visualizer: `recorder.ts` (AnalyserNode from shared AudioContext) + `tile.ts` (canvas element in recording state) + `main.ts` (30fps RAF loop with cleanup)
- Playback progress: `player.ts` (`getPlaybackInfo()`) + `tile.ts` (progress element in playing state) + `main.ts` (RAF loop cancelled on `source.onended`)
- Tile colors: `tile.ts` (CSS custom property `--tile-color`) + `action-sheet.ts` (8-swatch preset row) + `main.ts` (`handleColorChange`) + `index.html`

**Avoids:** 60fps thermal throttle (cap rAF at 30fps from day one), AnalyserNode wrong source (use `getAudioContext()` singleton), RAF loop leak (cancel in all stop paths including error paths)

**Research flag:** Needs real-device verification for AnalyserNode. `getByteTimeDomainData()` returning all-128 (flat) is a known iOS bug on some WebKit builds — implement the flat-line graceful degradation before device testing. Verify orange mic dot cleanup via Safari profiler after recording stops.

### Phase 3: Audio Operations — Trim and Export (Deferrable)

**Rationale:** The two most complex features are independent of Phase 2 and can slide to v1.2 without breaking the v1.1 story. Trim must land before export so the exporter sees the correct `mimeType` on trimmed clips (`audio/wav`, not `audio/mp4`). Both introduce new audio modules that benefit from isolated testing.

**Delivers:** Shorter, cleaner clips via auto-trim with silence detection; ability to share clips via iOS share sheet or file download

**Implements:**
- Audio trim: `audio/trimmer.ts` (new — amplitude threshold silence detection) + `audio/wav-encoder.ts` (new — RIFF WAV encoder) + `action-sheet.ts` (Trim button) + `main.ts` (`handleTrim`, `clearAudioCache` call)
- Clip export: `audio/exporter.ts` (new — Web Share API + download fallback) + `action-sheet.ts` (Export button) + `main.ts` (`handleExport`, pre-loaded blob)

**Avoids:** WAV re-encode pitfall (store trimmed audio as WAV, update `mimeType` to `'audio/wav'`, clear `audioBufferCache`), `navigator.share()` transient activation pitfall (pre-load blob before user gesture), `canShare()` missing guard (always check before calling share), download fallback in standalone PWA mode (detect `navigator.standalone` and avoid the `<a download>` path; use share sheet only)

**Research flag:** Needs real-device testing for Web Share file attachment on iOS 15+ and for trim quality on real recordings. Calibrate silence threshold against actual iPhone recordings before shipping. If schedule is tight, Phase 3 slides cleanly to v1.2.

### Phase Ordering Rationale

- Schema before UI: every downstream feature reads `SlotRecord.color`; landing it first means no feature is blocked by missing data model
- Low-risk dialog/badge changes co-located with schema (Phase 1) to produce an immediately useful delta and validate the `<dialog>` pattern
- RAF-driven visual features grouped together (Phase 2) because they share the same RAF loop cleanup patterns and all modify `tile.ts` and `main.ts`; doing them together reduces integration surface and makes real-device testing efficient
- New audio module features last (Phase 3) because they are the most complex, have the most iOS-specific failure modes, are independently deferrable to v1.2, and trim must precede export for correct `mimeType` on trimmed files
- This order matches the architecture document's recommended 8-step build sequence exactly

### Research Flags

Phases needing real-device verification before marking complete:
- **Phase 2 (Waveform):** AnalyserNode on `createMediaStreamSource` has a known iOS Safari zero-fill bug on some WebKit builds. Implement flat-line graceful fallback before device testing. Verify orange mic dot cleanup via Safari profiler.
- **Phase 3 (Trim):** AAC encoder priming delay affects silence detection. Test on real recordings (whispered content, ambient noise) before finalizing threshold. Verify trimmed WAV blob decodes correctly with `decodeAudioData` on iOS.
- **Phase 3 (Export):** Web Share Level 2 file attachment on iOS 15+ must be verified on device in standalone PWA mode. Confirm `canShare({ files: [audioMp4File] })` returns `true` for iOS-recorded `audio/mp4` blobs.

Phases with standard patterns (no additional research needed):
- **Phase 1 (Confirm dialog, duration badge):** `<dialog>` pattern proven in v1.0 production; `durationSeconds` already in `SlotRecord`; straightforward additive changes.
- **Phase 2 (Progress indicator):** `AudioContext.currentTime`-based RAF pattern is well-documented; no iOS-specific unknowns.
- **Phase 2 (Tile colors):** CSS custom property application and idb-keyval optional field storage are proven patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All APIs verified via MDN official docs; no new dependencies; existing stack confirmed stable through v1.0 ship; v1.1 adds only browser-native APIs |
| Features | HIGH (P1) / MEDIUM (P2 iOS edge cases) | P1 features have confirmed patterns in the codebase; export and trim iOS behavior (encoder delay, Web Share MIME allowlist) have MEDIUM confidence from community sources |
| Architecture | HIGH (integration points, data model) / MEDIUM (AnalyserNode iOS, WAV re-encode) | Module boundaries and build order are clear; WAV encoder approach is pragmatic but untested in this codebase specifically |
| Pitfalls | HIGH | Multiple verified sources: WebKit bug tracker, MDN, Apple Developer Forums, Tone.js community reports; pitfall list is comprehensive with recovery strategies and verification checklists |

**Overall confidence:** HIGH for Phase 1 and Phase 2; MEDIUM for Phase 3 (trim + export require real-device validation before shipping)

### Gaps to Address

- **AnalyserNode flat-data on target device:** Confirm `getByteTimeDomainData()` behavior on the development iPhone (the known zero-fill bug is pre-iOS 14.3; project requires iOS 14.3+, so it should be fixed). Implement the `all-128` flat-line fallback regardless, then verify on device.
- **Silence threshold calibration:** The `0.01` amplitude threshold is a research-derived starting point. Real-world recordings on the target iPhone require manual tuning during Phase 3 implementation. Plan a 15-minute calibration session with varied recording types (loud, soft, whispering, ambient noise).
- **Standalone PWA download fallback:** The `<a download>` fallback does not download to a visible file in iOS standalone mode — it opens Safari instead. For standalone mode, the share sheet must succeed, or the UX is confusing. Detect `navigator.standalone` and suppress the download link in that context; show an instruction to use the share sheet instead.
- **WAV file size in IndexedDB after trim:** Trimmed WAV blobs are approximately 5-10x larger than the original AAC blobs for the same audio duration. For 9 tiles × 30s clips, worst-case storage is ~22 MB. This is within iOS IndexedDB quota for installed PWAs, but worth monitoring. If storage becomes a concern, the offset-based trim approach (no re-encode, no size increase) is available as a fallback that avoids the WAV encoding step entirely.

## Sources

### Primary (HIGH confidence)
- [MDN — Web Audio API Visualizations](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) — AnalyserNode + Canvas exact pattern
- [MDN — AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) — `fftSize`, `frequencyBinCount`, `getByteTimeDomainData`
- [MDN — AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer) — `getChannelData`, `copyToChannel` for trim
- [MDN — Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) — `navigator.share`, `canShare`
- [MDN — AudioBufferSourceNode.start()](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start) — `start(when, offset, duration)` for offset-based trim
- [web.dev — Integrate with the OS sharing UI](https://web.dev/articles/web-share) — file sharing pattern, `canShare({ files })` usage
- [GitHub MDN content issue #32019](https://github.com/mdn/content/issues/32019) — confirmed iOS files-only constraint (no title/text alongside files)
- [CSS-Tricks — Building a Progress Ring Quickly](https://css-tricks.com/building-progress-ring-quickly/) — SVG stroke-dashoffset ring pattern
- [WebKit Blog — MediaRecorder API](https://webkit.org/blog/11353/mediarecorder-api/) — iOS `audio/mp4` only
- [WebKit Blog — P3 and Alpha Color Pickers](https://webkit.org/blog/16900/p3-and-alpha-color-pickers/) — `<input type="color">` iOS 17+ native picker

### Secondary (MEDIUM confidence)
- [Tone.js issue #129](https://github.com/Tonejs/Tone.js/issues/129) — `getFloatTimeDomainData` not available in Safari
- [Apple Developer Forums — WebRTC Microphone Audio AnalyserNode](https://developer.apple.com/forums/thread/91754) — iOS AnalyserNode zero-fill issue (pre-iOS 14.3 era)
- [firt.dev — iOS PWA Compatibility Notes](https://firt.dev/notes/pwa-ios/) — Web Share Level 2 supported since iOS 15.0
- [Motion Blog — When browsers throttle requestAnimationFrame](https://motion.dev/blog/when-browsers-throttle-requestanimationframe) — iOS Low Power Mode 30fps throttle confirmed
- [web.dev — Share Files pattern](https://web.dev/patterns/files/share-files/) — `canShare()` guard + blob URL fallback
- Web Audio API issue #2484 — `MediaStreamAudioSourceNode` memory leak on WebKit
- Web Audio API issue #496 — No `encodeAudioData` API (long-standing open request)
- [LogRocket — Advanced Guide to Web Share API](https://blog.logrocket.com/advanced-guide-web-share-api-navigator-share/) — `canShare()` detection, user gesture requirements

### Tertiary (LOW confidence — needs real-device validation)
- WebKit Bug #237878 — AudioContext suspended when page backgrounded
- WebKit Bug #215884 — getUserMedia recurring permission prompts in standalone mode
- Community reports on AAC encoder priming delay — threshold behavior needs real-device calibration with the specific iOS version in use

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
