# Pitfalls Research

**Domain:** iOS PWA Soundboard (Safari + Web Audio + MediaRecorder + IndexedDB)
**Researched:** 2026-02-22
**Confidence:** HIGH (multiple verified sources: WebKit bug tracker, MDN, official WebKit blog, community post-mortems)

---

## Critical Pitfalls

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

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| IndexedDB + Blob storage | Storing raw ArrayBuffer instead of Blob | Store Blob directly; reconstruct `ArrayBuffer` only for `decodeAudioData` |
| MediaRecorder + AudioContext | Piping MediaRecorder stream through AudioContext (monitoring) | Keep them separate: MediaRecorder writes to IndexedDB; AudioContext handles playback only |
| Service Worker + IndexedDB audio | Intercepting blob fetch URLs in SW | Do not route audio blob reads through SW; access IndexedDB directly from the main thread |
| PWA manifest + iOS | Missing `apple-touch-icon` meta tag | iOS ignores `manifest.json` icons for Home Screen; add `<link rel="apple-touch-icon">` explicitly |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Decoding audio on every tap | Noticeable delay after first tap | Decode all blobs on app startup and cache `AudioBuffer` in memory | With even 1 recording |
| Re-reading IndexedDB on every playback | Disk I/O latency on tap | Load all stored blobs into decoded `AudioBuffer`s at app startup | Immediately |
| Keeping `MediaStream` tracks alive after recording | Microphone icon stays in status bar; battery drain | Stop individual tracks after recording ends; close stream cleanly | Always visible |
| Large audio blobs (uncompressed PCM) | Storage bloated, decode slow | MediaRecorder with AAC (iOS default) is already compressed; do not convert to WAV | With 9 long recordings |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual feedback during recording | User does not know recording started | Animate tile (pulsing ring, color change) during active recording |
| Tap-to-start triggers even on long press | Long press for menu accidentally starts recording | Distinguish: short tap = record/play, long press (>400ms) = menu; cancel recording on long-press detection |
| Silent mute-switch failure with no indication | User thinks app is broken | Add visible waveform or level meter during playback; animate tile briefly on play trigger |
| No Add-to-Home-Screen prompt | User forgets to install; data gets evicted after 7 days | Show one-time banner on first visit in Safari browser mode prompting installation |
| Context menu appears beneath keyboard | If any input element exists, keyboard may obscure menu | Keep the UI input-free; do not use text fields |

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

---

## Sources

- WebKit Blog — MediaRecorder API announcement: https://webkit.org/blog/11353/mediarecorder-api/
- WebKit Blog — Updates to Storage Policy (Safari 17): https://webkit.org/blog/14403/updates-to-storage-policy/
- WebKit Bug #237878 — AudioContext suspended when page backgrounded: https://bugs.webkit.org/show_bug.cgi?id=237878
- WebKit Bug #215884 — getUserMedia recurring permission prompts in standalone: https://bugs.webkit.org/show_bug.cgi?id=215884
- WebKit Bug #237322 — Web Audio muted when ringer is muted: https://bugs.webkit.org/show_bug.cgi?id=237322
- GitHub Gist — iOS AudioContext "warm up" pattern (kus): https://gist.github.com/kus/3f01d60569eeadefe3a1
- Prototyp Digital — What we learned about PWAs and audio playback: https://blog.prototyp.digital/what-we-learned-about-pwas-and-audio-playback/
- MDN — Storage quotas and eviction criteria: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN — BaseAudioContext state: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state
- addpipe.com — Safari MediaRecorder codec support: https://blog.addpipe.com/safari-technology-preview-73-adds-limited-mediastream-recorder-api-support/
- Build with Matija — iPhone Safari MediaRecorder implementation: https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription
- Apple Developer Forums — MediaRecorder stop event not triggered on Safari iOS: https://developer.apple.com/forums/thread/662277
- Apple Developer Forums — iOS 26.1 webkit-touch-callout broken: https://developer.apple.com/forums/thread/808606
- Magicbell — PWA iOS Limitations and Safari Support: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide

---
*Pitfalls research for: iPhone PWA Soundboard — iOS/Safari/Web Audio/IndexedDB*
*Researched: 2026-02-22*
