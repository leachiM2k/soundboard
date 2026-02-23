# Pitfalls Research

**Domain:** iOS PWA Soundboard (Safari + Web Audio + MediaRecorder + IndexedDB)
**Researched:** 2026-02-22 (v1.0) | 2026-02-23 (v1.1 additions)
**Confidence:** HIGH (multiple verified sources: WebKit bug tracker, MDN, official WebKit blog, community post-mortems)

---

## v1.1 Integration Pitfalls (New — 2026-02-23)

These pitfalls apply specifically to adding new features to the working v1.0 system.
The existing system has a single AudioContext singleton, MediaRecorder producing AAC/mp4,
AudioBuffer cached per tile, and SlotRecord objects stored via idb-keyval.

---

### Pitfall V1: AnalyserNode Connected to Existing AudioContext Singleton — Wrong Source

**What goes wrong:**
To visualize the microphone waveform during recording, the natural instinct is to connect an `AnalyserNode` to the existing `AudioContext` singleton. But the singleton is used for playback of stored audio, not the live mic stream. Connecting the analyser to the wrong node gives frequency data from playback audio, not from the microphone. On iOS, connecting the analyser to the mic stream requires `ctx.createMediaStreamSource(stream)`, which creates a new source node in the shared context — but this is safe as long as only one such node is created per recording session.

**Why it happens:**
Developers think "shared AudioContext means shared signal chain." In reality the AudioContext is just a processing graph host. Playback nodes and mic-monitoring nodes are separate branches of the same graph and do not interfere.

**How to avoid:**
Create a `MediaStreamAudioSourceNode` from the mic stream once at recording start, then connect it to the AnalyserNode only. Never connect the analyser to `ctx.destination` — you do not want to route the mic to the speaker (feedback loop). Disconnect and discard the source node when recording stops.

```typescript
// At recording start:
const analyserNode = ctx.createAnalyser();
analyserNode.fftSize = 256; // small fftSize for low processing cost on iOS
const micSource = ctx.createMediaStreamSource(micStream);
micSource.connect(analyserNode);
// analyserNode is NOT connected to ctx.destination — analysis only, no speaker output

// At recording stop:
micSource.disconnect();
analyserNode.disconnect();
// Release references so GC can collect
```

**Warning signs:**
- Waveform shows signal even when microphone is silent.
- Waveform reacts to tile playback sounds during recording.
- Speaker emits mic audio (feedback loop) — this is the most dangerous sign.

**Phase to address:** Phase that implements VIZ-01 (waveform visualizer).

---

### Pitfall V2: AnalyserNode on iOS — 60fps Canvas Loop Burns CPU

**What goes wrong:**
Running `requestAnimationFrame` at 60fps to pull `AnalyserNode` data and repaint a canvas during recording causes measurable CPU heat on iPhone. On an older iPhone SE / iPhone 12 class device, this can cause thermal throttling after 10-15 seconds of recording, which slows the whole browser process including the MediaRecorder pipeline.

**Why it happens:**
The combination of: active microphone stream, MediaRecorder encoding, AnalyserNode FFT computation, canvas 2D clearRect + stroke path, and rAF scheduling at 60fps is a large per-frame workload on mobile. Safari on iOS cannot offload canvas 2D to a background thread (OffscreenCanvas worker support on iOS Safari is limited as of iOS 17). Additionally, iOS Safari throttles rAF to 30fps when the battery saver is active or the device is in Low Power Mode.

**How to avoid:**
- Target 30fps explicitly by skipping every other frame or using a timestamp guard:
  ```typescript
  let lastDraw = 0;
  function drawFrame(ts: number) {
    rafId = requestAnimationFrame(drawFrame);
    if (ts - lastDraw < 33) return; // ~30fps cap
    lastDraw = ts;
    // draw waveform
  }
  ```
- Use a small `fftSize` (256 or 512). Default 2048 is overkill for a simple waveform bar visualization.
- Clear only what changed. For a waveform bar chart, `clearRect` the whole canvas once per frame is fine; avoid path-heavy stroke loops with hundreds of points.
- Stop the rAF loop **immediately** when recording stops. Leaving it running wastes CPU with silence data.
- Use `analyser.getByteTimeDomainData()` (Uint8Array) rather than `getFloatTimeDomainData()` (Float32Array) — less memory allocation per frame.

**Warning signs:**
- iPhone gets warm after 5-10 seconds of waveform display.
- Frame rate drops to sub-20fps after 15 seconds on older devices.
- `cancelAnimationFrame` not called on recording stop — rAF runs forever, draining battery.

**Phase to address:** Phase that implements VIZ-01. Use 30fps cap and small fftSize from day one.

---

### Pitfall V3: AnalyserNode MediaStreamSource Node Not Cleaned Up — Memory / Mic Indicator Leak

**What goes wrong:**
After recording stops, if the `MediaStreamAudioSourceNode` (created from the mic stream) is not explicitly disconnected and dereferenced, the WebKit audio graph keeps a live reference to the node. On iOS, the microphone indicator (the orange dot in the status bar) may persist after recording stops, which alarms users. Additionally, the AnalyserNode continues receiving data from a stopped mic stream — though in practice the data will be silence.

**Why it happens:**
The Web Audio graph retains nodes until they are explicitly disconnected. Unlike a `MediaRecorder`, a `MediaStreamAudioSourceNode` has no "stop" event. WebKit has a known open issue (web-audio-api issue #2484) where nodes connected to an inactive stream are not automatically released even after all stream tracks are stopped.

**How to avoid:**
On every recording stop — whether user-initiated, auto-stopped at 30s, or cancelled — run explicit cleanup:
```typescript
function stopVisualizerCleanup() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  micSourceNode?.disconnect();
  analyserNode?.disconnect();
  micSourceNode = null;
  analyserNode = null;
}
```
This must be called in all stop paths: manual stop, 30s auto-stop, and error paths.

**Warning signs:**
- Orange microphone dot persists in iOS status bar after recording dialog closes.
- Memory usage in Safari Web Inspector grows with each recording session.
- Waveform canvas is no longer visible but rAF continues firing (detectable via Safari timeline profiler).

**Phase to address:** Phase implementing VIZ-01. Cleanup must be part of the recording lifecycle from the start, not added later.

---

### Pitfall V4: Playback Progress via rAF — AudioContext.currentTime Drifts from Wall Clock

**What goes wrong:**
To show a tile's playback progress bar, the most obvious approach is to use `AudioContext.currentTime` compared to the scheduled start time. However, `AudioContext.currentTime` advances based on the audio hardware clock, not wall clock time. On iOS, when the app is briefly backgrounded or the screen dims, `AudioContext.currentTime` may pause or lag relative to `Date.now()` by tens of milliseconds. The progress bar then stutters or jumps when the user returns focus.

**Why it happens:**
`AudioContext.currentTime` is hardware-synchronized. iOS may suspend the audio hardware clock during low-power states or background execution. `requestAnimationFrame` itself is also paused when the tab is hidden (per the Page Visibility spec), so in practice both clocks pause together — but they resume at different rates after an interruption.

**How to avoid:**
The correct pattern is to record the wall clock start time alongside `ctx.currentTime` at `source.start()`:
```typescript
const startedAt = ctx.currentTime;
const wallStart = performance.now();
// In rAF loop:
const elapsed = ctx.currentTime - startedAt; // audio-synchronized
const fraction = Math.min(elapsed / audioDuration, 1.0);
```
When the AudioContext is suspended/interrupted, `elapsed` will stop advancing — which is actually correct behaviour (no audio is playing), so the progress bar freezing is accurate rather than a bug. Do NOT use `Date.now() - wallStart` as a fallback during audio interruptions, because that will show progress advancing while no audio plays.

Also, ensure the rAF loop is cancelled in `source.onended` and in `stopTile()`:
```typescript
source.onended = () => {
  cancelAnimationFrame(progressRafId);
  // existing cleanup...
};
```

**Warning signs:**
- Progress bar jumps backwards or forward when returning from a brief background.
- `onended` fires but the progress bar stays at an intermediate position.
- Memory leak: `requestAnimationFrame` loop not cancelled after tile stops.

**Phase to address:** Phase implementing UX-03 (playback progress).

---

### Pitfall V5: Audio Trim — No Native Re-Encode; WAV Export Required

**What goes wrong:**
`AudioBuffer.copyFromChannel()` gives access to raw PCM samples. Trimming silence from start/end is straightforward sample math. But the result is a raw `Float32Array` — not a compressed audio blob. There is no `encodeAudioData()` in the Web Audio API spec (it is a long-standing open feature request, issue #496). Trying to create a `Blob` from PCM samples and store it as `audio/mp4` will produce an invalid, unplayable file.

**Why it happens:**
Developers assume `decodeAudioData` has an inverse. It does not. The Web Audio API can decode compressed audio into PCM but cannot encode PCM back into a compressed format natively. The only browser-native way to produce a playable audio file from PCM is to write it as WAV (PCM with RIFF headers), which is universally playable. But the existing pipeline stores `audio/mp4` (AAC) from MediaRecorder — mixing formats adds complexity.

**How to avoid:**
The practical approach for this app is to store the trimmed audio as a raw WAV blob. The WAV header is ~44 bytes; the rest is 16-bit or 32-bit PCM. The existing `player.ts` already calls `decodeAudioData` and caches `AudioBuffer` — so the trimmed WAV blob will also be decodable. The MIME type stored in `SlotRecord.mimeType` must be updated to `audio/wav`.

Write the WAV header manually (no library needed, ~30 lines):
```typescript
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1; // mono
  const sampleRate = buffer.sampleRate;
  const samples = new Float32Array(buffer.length);
  buffer.copyFromChannel(samples, 0);
  // Convert Float32 to Int16
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
  }
  // Write RIFF header + PCM data
  const byteLength = 44 + pcm.byteLength;
  const buf = new ArrayBuffer(byteLength);
  const view = new DataView(buf);
  // ... write RIFF/WAVE/fmt /data chunks
  return new Blob([buf], { type: 'audio/wav' });
}
```

**Critical**: After saving a trimmed WAV blob, invalidate the `AudioBuffer` cache for that tile (`clearAudioCache(index)`) so the next play re-decodes from the new WAV, not the old AAC.

**Warning signs:**
- Saving trimmed audio and then tapping the tile plays the untrimmed original (stale cache hit).
- Stored blob is non-zero size but `decodeAudioData` throws — indicates wrong format byte header.
- `mimeType` field still says `audio/mp4` but the blob is actually PCM — future code using `mimeType` to dispatch will fail.

**Phase to address:** Phase implementing TRIM-01 (audio trim).

---

### Pitfall V6: Audio Trim — Silence Detection Threshold and AAC Encoder Delay

**What goes wrong:**
Trimming "silence" by looking for samples below a threshold (e.g., amplitude < 0.01) can silently over-trim or under-trim, especially on iOS. iOS MediaRecorder produces AAC/mp4 audio. AAC encoders insert "priming frames" — typically 1024-2048 samples of silence — at the start of every encoded stream (encoder delay). When decoded by `decodeAudioData`, this priming silence appears as real signal-less samples at the beginning of the `AudioBuffer`. A naive trim will skip these and find the first real audio slightly later — which is correct — but if the recording starts with intentional quiet audio (whispered sound, soft tap), the trim will incorrectly delete the beginning of real content.

**Why it happens:**
AAC codec design: encoders add delay frames to align lookahead buffers. Different iOS versions produce different encoder delays. The decoded `AudioBuffer` contains these priming samples. A fixed threshold (0.01) is a guess that works for loud sounds but is wrong for quiet recordings.

**How to avoid:**
- Offer trim as a manual gesture, not automatic: let the user drag start/end markers rather than auto-trimming by amplitude. This avoids the threshold problem entirely.
- If auto-trim is required, use a higher threshold (0.005 to 0.02) with a minimum viable clip length guard — never trim so much that less than 0.1 seconds remains.
- Skip the first 1024 samples before scanning for audio onset, to skip AAC encoder delay priming.
- Show a waveform preview before committing the trim, so the user can confirm the result.

**Warning signs:**
- Trim cuts off the first syllable of a recording.
- After trim, the duration badge shows a significantly shorter clip than expected for a non-silent recording.
- Very quiet recordings are trimmed to near-zero length.

**Phase to address:** Phase implementing TRIM-01 (audio trim).

---

### Pitfall V7: Web Share API — Transient Activation Consumed by Async Operations Before share()

**What goes wrong:**
`navigator.share()` on iOS Safari requires transient activation (a user gesture must have occurred within the same call stack). If any `await` expression appears between the user tap and the `navigator.share()` call, iOS considers the transient activation consumed and throws `NotAllowedError`. This is the most common Web Share API failure on iOS.

**Why it happens:**
The transient activation window is 5 seconds (per spec) but iOS Safari is stricter: crossing an `await` boundary for an async operation (like reading a blob from IndexedDB or re-encoding audio) can break the activation context. Unlike `getUserMedia`, which has explicit async exemptions, `navigator.share()` has no async exemption — the share call must be direct.

**How to avoid:**
Prepare the share data (file blob) before the user taps the share button. Options:
1. Pre-load the blob from IndexedDB before rendering the share button, so `navigator.share({ files: [file] })` is synchronous from the gesture perspective.
2. If async work is unavoidable, perform it, then show a second tap target ("Tap to confirm share") — this creates a new transient activation.

```typescript
// WRONG — await before share breaks transient activation on iOS:
shareButton.addEventListener('click', async () => {
  const record = await loadSlot(index); // breaks activation
  await navigator.share({ files: [new File([record.blob], 'sound.m4a')] });
});

// CORRECT — blob already in memory when tap fires:
let cachedBlob: Blob | null = null;
// pre-load when tile becomes active or when share sheet is opened
shareButton.addEventListener('click', () => {
  if (!cachedBlob) return; // blob not ready; show spinner, user taps again
  navigator.share({ files: [new File([cachedBlob], 'sound.m4a', { type: cachedBlob.type })] });
});
```

**Warning signs:**
- `navigator.share()` throws `NotAllowedError` even when called from a button click.
- Share works on desktop Chrome but fails on iPhone Safari.
- Share works if the blob is already decoded in memory but fails when fetched from IndexedDB inline.

**Phase to address:** Phase implementing SHARE-01 (clip export).

---

### Pitfall V8: Web Share API — File Type Restrictions on iOS Safari

**What goes wrong:**
`navigator.share({ files: [...] })` on iOS Safari only shares files whose MIME type is on an OS-level allowlist. The behavior is not identical to Chromium's documented list. Specifically:
- `audio/mp4` and `audio/x-m4a` files: **Supported** on iOS 15+.
- `audio/webm`: **Not supported** on iOS Safari (WebM is not an Apple format).
- `audio/wav`: **Supported** on iOS 15+.
- `audio/ogg`: **Not supported**.

If the existing stored blob is `audio/webm` (recorded on desktop Chrome, then used on iPhone — edge case), sharing will silently fail with `NotAllowedError` or the share sheet will open with no file attached.

Always call `navigator.canShare({ files: [file] })` before calling `navigator.share()`, and show a download fallback if `canShare` returns false.

**How to avoid:**
```typescript
const file = new File([blob], filename, { type: mimeType });
if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
  // Fallback: trigger a download <a> element instead
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return;
}
await navigator.share({ files: [file] });
```

Note: `URL.createObjectURL` + download link fallback does NOT work in iOS Safari standalone PWA mode (tapping a download link in standalone opens Safari browser, breaking the PWA experience). In that case, display an "Copy" instruction or direct the user to use the share sheet only.

**Warning signs:**
- Share sheet opens but the audio file is not attached to the share.
- `canShare()` returns `false` for a file the developer expected to work.
- In standalone mode, download fallback opens a new browser tab instead of downloading.

**Phase to address:** Phase implementing SHARE-01. Implement `canShare` guard and fallback from the start.

---

### Pitfall V9: IndexedDB Backward Compatibility — Existing SlotRecords Missing New Fields

**What goes wrong:**
Adding new fields to `SlotRecord` (e.g., `color?: string`, `durationSeconds?: number`) is safe for new records but the existing 9 tiles in production IndexedDB will not have these fields. If any code accesses `record.color` or `record.durationSeconds` without checking for `undefined`, runtime errors or visual glitches occur (e.g., badge shows `NaN s`, tile renders with wrong background color).

**Why it happens:**
idb-keyval stores plain JSON-serializable objects. There is no schema version or migration — each stored object reflects exactly what was passed to `set()`. Old records literally lack the new fields. TypeScript's optional fields (`color?: string`) correctly model this — but it's easy to forget the guard when writing new rendering code.

**How to avoid:**
- Keep all new fields optional in the `SlotRecord` interface (already the pattern: `durationSeconds?` exists).
- Treat `undefined` as a defined default in every consumer: `record.color ?? '#3B82F6'` not `record.color`.
- Do not add a fake "migration" step that reads all 9 slots and rewrites them with default values — this is wasted writes and can race with a simultaneous read on app start.
- The correct migration strategy for idb-keyval: never migrate. Design every new field with a meaningful `undefined` default, and handle `undefined` everywhere that field is read.

The `durationSeconds` field is already in the v1.0 `SlotRecord` interface as optional. The pattern is proven — extend it for `color` and any other v1.1 additions.

**Warning signs:**
- Duration badge shows "NaN s" or "undefineds" on tiles recorded before the update.
- Tile color is wrong (`#000000` or transparent) for old recordings.
- `TypeError: Cannot read properties of undefined` when accessing new fields on loaded slot records.

**Phase to address:** Every phase that adds a new `SlotRecord` field. No special migration phase needed — just enforce optional field discipline.

---

### Pitfall V10: Stale AudioBuffer Cache After Trim — Old Decoded Audio Plays

**What goes wrong:**
The existing system caches decoded `AudioBuffer` per tile in memory (`audioBufferCache` Map in `player.ts`). After a trim operation saves a new WAV blob to IndexedDB and updates the `SlotRecord`, the old `AudioBuffer` (from the pre-trim AAC blob) remains in the cache. Tapping the tile immediately after trim plays the old untrimmed audio.

**Why it happens:**
The cache is keyed by tile index and is never invalidated unless `clearAudioCache(index)` is explicitly called. The trim operation writes to IndexedDB and updates in-memory `SlotRecord` state, but if it does not also call `clearAudioCache`, the player silently uses the stale decoded buffer.

**How to avoid:**
Any operation that replaces a tile's blob must call `clearAudioCache(tileIndex)` immediately after saving the new blob. This already happens for delete and re-record (v1.0 pattern). Trim must follow the same pattern:
```typescript
// After saving trimmed blob to IndexedDB:
await saveSlot(index, trimmedRecord);
clearAudioCache(index); // REQUIRED — otherwise next play uses old audio
```

**Warning signs:**
- Tap tile after trim — audio plays back untrimmed length.
- Duration badge updates to new shorter duration, but audio is clearly the original length.
- Works correctly after a full app reload (reload clears the in-memory cache).

**Phase to address:** Phase implementing TRIM-01. Add cache invalidation as part of the trim save flow.

---

### Pitfall V11: Color Field in IndexedDB — Structured Clone Does Not Handle CSS Color Strings Specially

**What goes wrong:**
Storing `color: "#FF0000"` in `SlotRecord` is straightforward and fully compatible with the Structured Clone algorithm (used by IndexedDB). No pitfall here for storage itself. The pitfall is in the UI: if the color is applied directly as a CSS custom property or inline style, and the stored value is an invalid CSS color string (e.g., user tampered with DevTools storage), the tile renders with no background and no error is thrown — the invalid value is silently ignored by CSS.

**Why it happens:**
CSS silently ignores invalid property values. `element.style.backgroundColor = "not-a-color"` is a silent no-op. The element falls back to its cascade background without any JS error.

**How to avoid:**
Validate the color value when reading from storage. A simple guard:
```typescript
function safeColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  // CSS.supports is available on iOS Safari 14+
  return CSS.supports('color', color) ? color : fallback;
}
```
Apply `safeColor(record.color, DEFAULT_TILE_COLOR)` in the tile renderer.

**Warning signs:**
- Tile renders as transparent or default grey after a color was set.
- No JS console error, making the bug invisible.
- `CSS.supports('color', storedValue)` returns `false` in testing.

**Phase to address:** Phase implementing COLOR-01 (tile colors). Include validation in the tile render path.

---

## Critical Pitfalls (v1.0 — Original)

### Pitfall 1: AudioContext Requires a User Gesture to Unlock

**What goes wrong:**
Safari on iOS blocks all audio output from `AudioContext` until a real user gesture (tap, click) has triggered `audioContext.resume()` or a buffer playback. If you create an `AudioContext` at module load time and immediately try to play a sound, it silently fails. No error is thrown — the audio just does not play.

**Why it happens:**
iOS enforces a strict media autoplay policy: audio hardware access requires explicit user opt-in. Developers familiar with desktop browsers where audio works freely do not expect this. The `AudioContext` may show `state: "suspended"` rather than throwing, making the failure invisible.

**How to avoid:**
- Create a single `AudioContext` instance lazily (on first tap) or immediately but call `audioContext.resume()` inside every click/touchend handler before playing.
- The canonical unlock pattern: on the first `touchend` event, play a zero-duration silent buffer to "warm up" the context, then remove the listener.
- Never create more than one `AudioContext` — Safari enforces a hard limit of 4 simultaneous instances; a fifth creation throws `UnknownError`.
- Reuse the single context for all 9 tiles via `AudioBufferSourceNode` instances.

```javascript
// Unlock pattern — attach once, remove after first interaction
function unlockAudio(ctx) {
  const buf = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
  ctx.resume();
}
document.addEventListener('touchend', () => unlockAudio(audioCtx), { once: true });
```

**Warning signs:**
- Tapping a tile in Safari does nothing and no error appears in the console.
- `audioCtx.state` logs as `"suspended"` after a tap.
- Works fine in Chrome/Firefox desktop but fails on device.

**Phase to address:** Phase 1 (audio playback infrastructure) — build the unlock gate before any tile tap logic.

---

### Pitfall 2: AudioContext Enters "interrupted" State After External Events

**What goes wrong:**
Even after the context is unlocked by a user gesture, iOS suspends the `AudioContext` whenever a phone call arrives, a notification plays audio, Siri activates, or the app is backgrounded. The state becomes `"interrupted"` (not `"suspended"`), and `resume()` will reject until the interruption ends. On return to the foreground, the context does not automatically recover.

**Why it happens:**
iOS treats the Web Audio API like any other audio session. The OS can revoke hardware access at any time. The `"interrupted"` state (added to the Web Audio spec specifically because of iOS behavior) signals that the app cannot resume until the OS releases the audio hardware. Many implementations only check for `"suspended"` and miss `"interrupted"`.

**How to avoid:**
- Listen to `audioCtx.onstatechange` and also to `document.addEventListener("visibilitychange")`.
- On `visibilityState === "visible"`, call `audioCtx.resume()` and handle the rejection gracefully.
- Check both `"suspended"` and `"interrupted"` states.

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
      audioCtx.resume().catch(() => {/* will retry on next user tap */});
    }
  }
});
```

- For soundboard use (tap to play), a simpler recovery: call `audioCtx.resume()` at the start of every tap handler. If the context is running it is a no-op; if interrupted it restores on next user gesture.

**Warning signs:**
- Audio plays fine initially but stops working after a phone call or after backgrounding the app.
- `audioCtx.state` is `"interrupted"` after returning to the app.
- The bug tracker confirms this has been open for years: WebKit bug #237878.

**Phase to address:** Phase 1 (audio playback infrastructure) — handle all context states as part of the playback utility, not as an afterthought.

---

### Pitfall 3: iOS Silent Mode (Mute Switch) Blocks Web Audio Entirely

**What goes wrong:**
When the iPhone hardware mute switch is engaged (ringer off), Safari blocks all `AudioContext` / Web Audio API output. The app appears to work (no errors, state is `"running"`) but produces zero audio. `HTMLAudioElement` is similarly blocked. There is no API to detect the mute state from JavaScript.

**Why it happens:**
iOS maps Web Audio output to the `Ambient` audio category by default, which respects the mute switch. Native apps can request the `Playback` category to override this, but PWAs cannot set `AVAudioSession` categories directly from JavaScript.

**How to avoid:**
- This is not fully preventable from a PWA. The practical workarounds are:
  1. Display a visible indicator during recording and playback so users can notice silence and check their mute switch.
  2. Use a visual confirmation (e.g., waveform animation during recording) so users can tell the app is alive even without sound.
- The library `unmute-ios-audio` (npm: `unmute-ios-audio`) works around this for some iOS versions by playing audio through a dummy `<audio>` element to switch the session category, but behavior is version-dependent and unreliable.
- Do not promise audio will always work — document this limitation in any onboarding UI.

**Warning signs:**
- Everything looks fine in the UI (recording animates, playback button triggers) but no audio comes out.
- Reports of "it doesn't work" from users without any console errors.

**Phase to address:** Phase 1 (audio playback) — add visual playback feedback so silent-mode failures are detectable by the user; Phase 2 (UX polish) — add a first-run hint or a visible indicator when the app first loads.

---

### Pitfall 4: MediaRecorder on iOS Only Supports AAC in MP4 Container

**What goes wrong:**
iOS Safari's `MediaRecorder` API supports only `audio/mp4` with AAC codec. It does not support `audio/webm`, `audio/ogg`, or `audio/opus`. Hardcoding any of those MIME types will cause `MediaRecorder` construction to throw `NotSupportedError` on iOS. The default MIME type (passing no `mimeType` option) returns MP4/AAC on Safari, WebM/Opus on Chrome — leading to incompatible blobs if the code later assumes a single format.

**Why it happens:**
The MediaRecorder spec was implemented much later in WebKit than in Blink/Gecko. Apple implemented AAC first (it is a native codec on Apple silicon). Cross-platform code that assumes WebM/Opus is universal breaks on iOS.

**How to avoid:**
Always use `MediaRecorder.isTypeSupported()` to select the codec at runtime:

```javascript
function getSupportedMimeType() {
  const candidates = [
    'audio/mp4;codecs=mp4a.40.2', // AAC-LC — Safari
    'audio/webm;codecs=opus',      // Chrome/Firefox
    'audio/ogg;codecs=opus',       // Firefox
    'audio/mp4',                   // Safari fallback
    '',                            // browser default
  ];
  return candidates.find(t => t === '' || MediaRecorder.isTypeSupported(t)) ?? '';
}
```

Store the detected MIME type alongside each recording blob in IndexedDB so playback code knows how to load it.

**Warning signs:**
- `new MediaRecorder(stream, { mimeType: 'audio/webm' })` throws on device.
- Recorded blobs have 0 bytes or playback fails with a decode error.
- `MediaRecorder.isTypeSupported('audio/webm')` returns `false` on an iPhone.

**Phase to address:** Phase 1 (recording infrastructure) — detect supported MIME types at startup and use them throughout.

---

### Pitfall 5: Long Press Triggers Safari's Native Context Menu, Overriding Custom UI

**What goes wrong:**
Implementing "long press a tile to get Delete / Re-Record options" — a core requirement — collides with Safari's built-in long-press behavior (link previews, image save dialogs, text selection handles). The native callout appears on top of or instead of the custom context menu.

**Why it happens:**
iOS Safari intercepts `touchstart` / `touchend` for its own gesture recognition before firing `contextmenu`. The CSS property `-webkit-touch-callout: none` is supposed to prevent callouts but is documented as not reliably working in iOS 15-17+ (confirmed broken in iOS 26.1 thread on Apple Developer Forums).

**How to avoid:**
The combination that actually works:

```css
.tile {
  -webkit-touch-callout: none;  /* attempt suppression (unreliable alone) */
  -webkit-user-select: none;     /* prevents text selection highlight */
  user-select: none;
}
```

Plus JavaScript: prevent the `contextmenu` event and be careful with `touchstart` `preventDefault` — calling it on all `touchstart` events will break native scroll behavior elsewhere.

```javascript
tile.addEventListener('contextmenu', e => e.preventDefault()); // suppress native menu

let longPressTimer;
tile.addEventListener('touchstart', e => {
  longPressTimer = setTimeout(() => showCustomMenu(), 500);
}, { passive: true }); // passive: true preserves scroll

tile.addEventListener('touchend', () => clearTimeout(longPressTimer));
tile.addEventListener('touchmove', () => clearTimeout(longPressTimer)); // cancel on drag
```

Note: `passive: true` on `touchstart` means you cannot call `e.preventDefault()` inside it. Use a `contextmenu` listener for the menu suppression instead.

**Warning signs:**
- Long pressing a tile shows Safari's "Open in New Tab" or image save UI instead of custom options.
- Text or image in the tile gets selected and highlighted on long press.
- Custom menu appears briefly and then is replaced by the native one.

**Phase to address:** Phase 1 (tile interaction) — build the long-press handler correctly from day one; retrofitting touch event handling is error-prone.

---

### Pitfall 6: IndexedDB Data Loss When App Is Not Used as Home Screen PWA

**What goes wrong:**
In Safari browser mode (not installed to Home Screen), Safari applies a 7-day eviction policy: if the user does not open the site for 7 days, all IndexedDB data (including audio blobs) is deleted automatically. This means recorded sounds silently vanish.

**Why it happens:**
WebKit's Intelligent Tracking Prevention (ITP) treats uninstalled web origins as potentially tracking-relevant and aggressively clears their storage. The policy was introduced in iOS 13.4 / Safari 13.1. Installed Home Screen Web Apps are exempt from this eviction.

**How to avoid:**
- The product requirement already targets Home Screen installation — push users toward it as the primary flow (the app is already constrained to iOS Home Screen use).
- Call `navigator.storage.persist()` after the first user interaction. WebKit grants this for Home Screen apps automatically. In browser mode it may or may not be granted.
- Display a clear "Add to Home Screen" instruction on first launch so users install it before recording anything valuable.
- Do NOT store sounds only in Cache API (Service Worker cache) — that has a ~50 MB limit and is also subject to eviction. IndexedDB is the right store, but only reliably persistent after Home Screen installation.

**Warning signs:**
- User reports sounds disappearing without any app update.
- `navigator.storage.estimate()` shows usage near zero despite prior recordings.
- Only happens to users who open the app via Safari browser rather than Home Screen icon.

**Phase to address:** Phase 1 (storage layer) — use IndexedDB correctly and call `persist()`; Phase 2 (onboarding) — guide users to install to Home Screen before recording.

---

### Pitfall 7: Service Worker Scope / Cache Conflicts Break Offline Load

**What goes wrong:**
The app shell (HTML, CSS, JS) must load even when offline to work as a Home Screen PWA. If the Service Worker is not registered before the user goes offline, or if the cache names are not versioned correctly, the app loads a stale or broken shell, or fails with a network error when launched from the Home Screen without connectivity.

**Why it happens:**
Safari's Service Worker implementation has known quirks: it sometimes uses memory cache instead of the Service Worker cache (reported in Workbox issues). Additionally, the Service Worker registration must complete on the first online visit, and cached app shell assets must explicitly cover all routes the standalone app might navigate to.

**How to avoid:**
- Use a simple cache-first strategy for the app shell. For a single-screen app with no navigation, this is straightforward.
- Version the cache name (e.g., `soundboard-v1`) and delete old caches on `activate`.
- Do not cache audio blobs in the Service Worker Cache API — store them only in IndexedDB. Cache API has a ~50 MB limit on iOS; IndexedDB is the right store for user-generated blobs.
- Test offline launch from the Home Screen explicitly before shipping.

**Warning signs:**
- App loads fine online but shows blank screen or network error when launched from Home Screen with WiFi off.
- `caches.match()` returns nothing even though you thought you cached the shell.
- App works in Safari browser offline tab but fails in standalone mode (different origin scoping behavior).

**Phase to address:** Phase 2 (PWA / offline) — get the Service Worker working correctly as a dedicated step, not bundled with feature work.

---

### Pitfall 8: HTMLAudioElement Has 300-500ms Latency on iOS — Wrong Tool for Soundboard

**What goes wrong:**
Using `<audio>` elements or `HTMLAudioElement` to play back sounds on a soundboard tile creates a 300-500ms delay between tap and audio start. On iOS Safari, the audio element also has a single-channel limitation in some older versions, meaning concurrent sounds can cut each other off.

**Why it happens:**
`HTMLAudioElement` triggers a media resource fetch pipeline on every play, even for cached blobs. `AudioContext` + `AudioBufferSourceNode` decodes audio into memory once and plays immediately from RAM, giving near-zero latency. Safari's `HTMLAudioElement` also reloads on each play in some edge cases.

**How to avoid:**
Use Web Audio API exclusively for playback:
1. On app startup (after context unlock), decode all stored audio blobs with `audioCtx.decodeAudioData()`.
2. Store decoded `AudioBuffer` objects in memory keyed by tile index.
3. On tap: create an `AudioBufferSourceNode`, connect to destination, call `start(0)`.

This gives immediate, low-latency, polyphonic playback. `HTMLAudioElement` is the wrong tool for a soundboard.

**Warning signs:**
- Tapping a tile has a noticeable half-second delay before sound.
- Audio clips each other when tiles are tapped in quick succession.
- Works better in desktop Chrome (which has lower `HTMLAudioElement` latency) than on iPhone.

**Phase to address:** Phase 1 (audio playback) — choose Web Audio API from the start; switching later requires rewriting the playback subsystem.

---

### Pitfall 9: Microphone Permission Re-Prompted on Hash/Route Changes in PWA Mode

**What goes wrong:**
In standalone PWA mode (Home Screen app), Safari re-prompts for microphone permission whenever the URL hash changes or if any navigation-like event happens. Each recording attempt may trigger a new permission dialog, breaking the tap-to-record flow.

**Why it happens:**
WebKit bug #215884: PWA standalone mode ties microphone permission to the exact URL at time of permission grant. Hash changes are treated as new origins or new navigation targets in some iOS versions, triggering re-evaluation of permission.

**How to avoid:**
- Use a Single-Page Application with no URL hash changes or pushState navigation. The soundboard already plans to be a single screen — keep it strictly on one URL (e.g., always at `/`).
- Do not use URL hash fragments (`#tile-3`) as state. Use in-memory state only.
- Obtain microphone permission once on first recording attempt and hold onto the `MediaStream` object (do not call `getUserMedia` on every recording). Stop tracks only when done, or keep the stream alive.

**Warning signs:**
- Second recording attempt shows a permission dialog after first was already granted.
- Console shows `getUserMedia` being called repeatedly.
- Permission works fine in Safari browser but breaks in Home Screen standalone mode.

**Phase to address:** Phase 1 (recording infrastructure) — use single-URL SPA with stream reuse from the start.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| One `new Audio()` element per tile | Simple to set up | Latency, single-channel, iOS reload bug | Never — use Web Audio |
| Create `AudioContext` per tap | Avoids singleton complexity | Hits 4-instance Safari limit quickly | Never |
| Store audio in Cache API instead of IndexedDB | Simpler SW setup | 50 MB limit, eviction, blob handling issues | Never for user blobs |
| Use CSS `-webkit-touch-callout: none` alone for long-press | One-liner | Broken in iOS 15-26 without JS backup | Only alongside `contextmenu` preventDefault |
| Hardcode `audio/webm` MIME type | Matches Chrome default | `NotSupportedError` on all iPhones | Never |
| Skip `navigator.storage.persist()` call | Less code | Data evicted after 7 days in browser mode | Never |
| 60fps rAF for waveform visualizer | Simple code | CPU heat, thermal throttling on older iPhones | Never — cap at 30fps |
| `await` before `navigator.share()` | Allows async data prep inline | `NotAllowedError` on iOS Safari always | Never — pre-load data before gesture |
| No `canShare()` guard before `navigator.share()` | Less code | Silent failure when MIME type unsupported | Never |
| Store new SlotRecord fields without `undefined` default | Simpler type | Runtime errors on existing records without field | Never |
| Skip `clearAudioCache()` after trim save | Less code | Old audio plays after trim until app reload | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| IndexedDB + Blob storage | Storing raw ArrayBuffer instead of Blob | Store Blob directly; reconstruct `ArrayBuffer` only for `decodeAudioData` |
| MediaRecorder + AudioContext | Piping MediaRecorder stream through AudioContext (monitoring) | Keep them separate: MediaRecorder writes to IndexedDB; AudioContext handles playback only |
| Service Worker + IndexedDB audio | Intercepting blob fetch URLs in SW | Do not route audio blob reads through SW; access IndexedDB directly from the main thread |
| PWA manifest + iOS | Missing `apple-touch-icon` meta tag | iOS ignores `manifest.json` icons for Home Screen; add `<link rel="apple-touch-icon">` explicitly |
| AnalyserNode + MediaRecorder stream | Connecting analyser to wrong AudioContext node | Use `ctx.createMediaStreamSource(micStream)` — separate branch from playback graph |
| AnalyserNode cleanup | Not calling `disconnect()` on source node after recording stops | Always call `micSource.disconnect()` and `cancelAnimationFrame()` in all stop paths |
| AudioBuffer trim + cache | Saving trimmed blob without clearing decoded cache | Call `clearAudioCache(index)` immediately after saving trimmed blob |
| Web Share API + async | `await`ing data fetch before `navigator.share()` | Pre-load blob; call `share()` synchronously from the tap handler |
| Web Share API + MIME types | Assuming `audio/webm` is shareable on iOS | Check `canShare()` first; provide download fallback for unsupported types |
| SlotRecord new fields | Assuming all loaded records have the new field | Use `record.newField ?? defaultValue` everywhere; optional fields never have defaults in IndexedDB |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Decoding audio on every tap | Noticeable delay after first tap | Decode all blobs on app startup and cache `AudioBuffer` in memory | With even 1 recording |
| Re-reading IndexedDB on every playback | Disk I/O latency on tap | Load all stored blobs into decoded `AudioBuffer`s at app startup | Immediately |
| Keeping `MediaStream` tracks alive after recording | Microphone icon stays in status bar; battery drain | Stop individual tracks after recording ends; close stream cleanly | Always visible |
| Large audio blobs (uncompressed PCM) | Storage bloated, decode slow | MediaRecorder with AAC (iOS default) is already compressed; WAV blobs from trim are larger — consider this acceptable for short clips | With 9 long recordings trimmed to WAV |
| 60fps rAF waveform loop | CPU heat, thermal throttle, choppy frame rate | Cap at 30fps with timestamp guard; use fftSize 256 | Immediately on older iPhones |
| rAF loop not cancelled on recording stop | CPU drain after recording ends, battery usage | Always `cancelAnimationFrame(rafId)` in all stop paths | Immediately when stop is triggered |
| rAF loop not cancelled on playback end | CPU drain for progress bar after audio finishes | Cancel rAF in `source.onended` and `stopTile()` | Immediately |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual feedback during recording | User does not know recording started | Animate tile (pulsing ring, color change) during active recording |
| Tap-to-start triggers even on long press | Long press for menu accidentally starts recording | Distinguish: short tap = record/play, long press (>400ms) = menu; cancel recording on long-press detection |
| Silent mute-switch failure with no indication | User thinks app is broken | Add visible waveform or level meter during playback; animate tile briefly on play trigger |
| No Add-to-Home-Screen prompt | User forgets to install; data gets evicted after 7 days | Show one-time banner on first visit in Safari browser mode prompting installation |
| Context menu appears beneath keyboard | If any input element exists, keyboard may obscure menu | Keep the UI input-free; do not use text fields |
| Auto-trim cuts beginning of quiet recording | User loses important audio content | Make trim manual (drag markers) not automatic; or show waveform preview before confirming |
| Share fails silently on iOS with `audio/webm` blob | User taps share, nothing happens | Show `canShare()` gate; explain fallback; never silently fail |
| Download fallback opens new Safari tab in standalone mode | Breaks PWA experience, user confused | Detect standalone mode (`navigator.standalone`) before offering download link; use share sheet only in standalone |

---

## "Looks Done But Isn't" Checklist

- [ ] **AudioContext unlock:** Test on a real iPhone, not just desktop Safari or iOS Simulator — the Simulator does not enforce the user-gesture requirement the same way.
- [ ] **Mute switch:** Test playback with the physical mute switch engaged on a real device.
- [ ] **Long press menu:** Confirm the native Safari callout does not appear alongside or before the custom menu.
- [ ] **Offline launch:** Disable WiFi, launch from Home Screen icon — app must load with all 9 tiles.
- [ ] **Data persistence:** Install to Home Screen, record a sound, close Safari completely, reopen — sound must survive.
- [ ] **AudioContext state after call:** Simulate an incoming call interruption; verify tapping a tile restores audio after call ends.
- [ ] **Re-recording:** Delete a sound, record a new one, restart app — verify new sound persists, old is gone.
- [ ] **Codec detection:** Verify `MediaRecorder.isTypeSupported()` is called at runtime and the detected MIME type is stored with each blob.
- [ ] **Waveform visualizer cleanup:** After recording stops, confirm orange mic dot disappears and rAF is no longer firing (check Safari profiler).
- [ ] **Playback progress cancel:** Tap a tile to play, tap again to stop — confirm progress bar resets and rAF loop stops.
- [ ] **Trim cache invalidation:** Trim a clip, tap tile immediately — plays trimmed audio not original.
- [ ] **Trim on quiet recording:** Record a whispered sound, trim — confirm clip is not trimmed to silence.
- [ ] **Share on existing `audio/mp4` recording:** Tap share, iOS share sheet appears with file attached.
- [ ] **Share with `canShare` false:** Manually test with a `audio/webm` blob; verify graceful fallback, no JS error.
- [ ] **Old SlotRecord compatibility:** Open app on device that had v1.0 recordings; all tiles render correctly (duration badge gracefully handles missing `durationSeconds`, color shows default).
- [ ] **Tile color persists across reload:** Set a color, close and reopen app from Home Screen — color survives.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| AudioContext not unlocked at all | LOW | Add `.resume()` call in tap handler; one-liner fix |
| AudioContext "interrupted" not handled | LOW | Add `visibilitychange` listener; one-liner fix |
| Wrong MIME type hardcoded | MEDIUM | Add `isTypeSupported()` detection; may need to re-record existing stored audio if format is unreadable |
| Long press triggers both native and custom menu | MEDIUM | Add `contextmenu` preventDefault and adjust CSS; test thoroughly |
| Audio stored in Cache API (evicted) | HIGH | Migrate storage layer to IndexedDB; existing user data already lost |
| `HTMLAudioElement` used for playback | HIGH | Replace entire playback subsystem with Web Audio API |
| Hash-based routing causes permission re-prompts | HIGH | Refactor routing to hash-free SPA; affects all navigation |
| rAF loop not cancelled (waveform or progress) | LOW | Add `cancelAnimationFrame` to all stop paths; verify in profiler |
| Stale AudioBuffer cache after trim | LOW | Add `clearAudioCache(index)` call to trim save flow |
| `await` before `navigator.share()` fails | MEDIUM | Refactor share handler to pre-load blob; two-tap UX if needed |
| Trim WAV blob stored with wrong MIME type | MEDIUM | Update `mimeType` field to `audio/wav` alongside blob save; clear cache |
| New SlotRecord field causes crash on old record | LOW | Add `?? default` guard at read sites; no migration needed |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| AudioContext user gesture unlock | Phase 1 (audio playback) | Tap tile on real iPhone without prior interaction; audio plays |
| AudioContext "interrupted" state | Phase 1 (audio playback) | Lock screen, unlock, tap tile; audio plays without re-granting gesture |
| Mute switch silence | Phase 1 (audio playback) | Engage mute switch; visible animation confirms playback attempt |
| MediaRecorder MIME type | Phase 1 (recording) | Record on iPhone; blob is non-zero; plays back |
| Long press native menu conflict | Phase 1 (tile interaction) | Long press on real device; only custom menu appears |
| IndexedDB eviction in browser mode | Phase 1 (storage) + Phase 2 (onboarding) | `navigator.storage.persist()` called; Add to Home Screen prompt shown |
| Service Worker offline | Phase 2 (PWA offline) | Launch from Home Screen with airplane mode on |
| HTMLAudioElement latency | Phase 1 (audio playback) | Tap tile; audio starts within 50ms on real device |
| Microphone re-permission prompts | Phase 1 (recording) | Record twice consecutively in standalone mode; no second dialog |
| AnalyserNode wrong source connection | VIZ-01 phase | Waveform shows mic activity; no feedback loop; no playback bleed |
| AnalyserNode 60fps CPU burn | VIZ-01 phase | iPhone stays cool after 15s recording; rAF runs at ~30fps |
| AnalyserNode / rAF not cleaned up | VIZ-01 phase | Orange mic dot disappears; rAF loop not firing post-stop (profiler) |
| rAF progress loop not cancelled | UX-03 phase | Stop tile mid-play; progress bar stops and rAF halts |
| AudioContext.currentTime drift | UX-03 phase | Progress bar freezes during interruption, resumes correctly after |
| AudioBuffer trim — no encodeAudioData | TRIM-01 phase | Trimmed blob is WAV; playable; `mimeType` updated to `audio/wav` |
| AAC encoder delay causing over-trim | TRIM-01 phase | Whispered recording trims correctly; first syllable not cut |
| Stale AudioBuffer cache after trim | TRIM-01 phase | Tap after trim plays trimmed version immediately |
| Web Share — transient activation consumed | SHARE-01 phase | Tap share button; share sheet opens on first tap |
| Web Share — unsupported MIME type | SHARE-01 phase | `canShare()` used; fallback shown for unsupported formats |
| SlotRecord backward compat — missing fields | COLOR-01, UX-02 phases | Old tiles render with correct defaults; no NaN or undefined values |
| Color stored as invalid CSS value | COLOR-01 phase | `CSS.supports()` guard prevents invalid values reaching style API |

---

## Sources

- WebKit Blog — MediaRecorder API announcement: https://webkit.org/blog/11353/mediarecorder-api/
- WebKit Blog — Updates to Storage Policy (Safari 17): https://webkit.org/blog/14403/updates-to-storage-policy/
- WebKit Bug #237878 — AudioContext suspended when page backgrounded: https://bugs.webkit.org/show_bug.cgi?id=237878
- WebKit Bug #215884 — getUserMedia recurring permission prompts in standalone: https://bugs.webkit.org/show_bug.cgi?id=215884
- WebKit Bug #237322 — Web Audio muted when ringer is muted: https://bugs.webkit.org/show_bug.cgi?id=237322
- Web Audio API issue #2484 — MediaStreamAudioSourceNode memory leak: https://github.com/WebAudio/web-audio-api/issues/2484
- Web Audio API issue #496 — Feature request for encodeAudioData: https://github.com/WebAudio/web-audio-api/issues/496
- Daniel Barta — Creating Audio on the Web Is Easy Until It's Time to Export: https://danielbarta.com/export-audio-on-the-web/
- MDN — AnalyserNode: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- MDN — Navigator.canShare(): https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare
- MDN — Web Share API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API
- MDN — AudioBuffer.copyFromChannel(): https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer/copyFromChannel
- Motion Blog — When browsers throttle requestAnimationFrame: https://motion.dev/blog/when-browsers-throttle-requestanimationframe
- web.dev — Integrate with the OS sharing UI with the Web Share API: https://web.dev/articles/web-share
- GitHub Gist — iOS AudioContext "warm up" pattern (kus): https://gist.github.com/kus/3f01d60569eeadefe3a1
- Prototyp Digital — What we learned about PWAs and audio playback: https://blog.prototyp.digital/what-we-learned-about-pwas-and-audio-playback/
- MDN — Storage quotas and eviction criteria: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN — BaseAudioContext state: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state
- addpipe.com — Safari MediaRecorder codec support: https://blog.addpipe.com/safari-technology-preview-73-adds-limited-mediastream-recorder-api-support/
- Build with Matija — iPhone Safari MediaRecorder implementation: https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription
- Apple Developer Forums — MediaRecorder stop event not triggered on Safari iOS: https://developer.apple.com/forums/thread/662277
- Apple Developer Forums — iOS 26.1 webkit-touch-callout broken: https://developer.apple.com/forums/thread/808606
- Magicbell — PWA iOS Limitations and Safari Support: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- Experience-Monks/audiobuffer-to-wav — WAV export from AudioBuffer: https://github.com/Experience-Monks/audiobuffer-to-wav
- Lee Martin — Sharing Files from iOS 15 Safari to Apps using Web Share: https://blog.bitsrc.io/sharing-files-from-ios-15-safari-to-apps-using-web-share-c0e98f6a4971
- WebKit Bug #202405 — iOS 13.1 MediaStreamTrack.enabled kills audio track: https://bugs.webkit.org/show_bug.cgi?id=202405

---
*Pitfalls research for: iPhone PWA Soundboard — iOS/Safari/Web Audio/IndexedDB*
*v1.0 original: 2026-02-22 | v1.1 additions: 2026-02-23*
