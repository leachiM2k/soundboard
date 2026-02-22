# Stack Research

**Domain:** iPhone PWA Soundboard — audio recording, playback, local-only storage
**Researched:** 2026-02-22
**Confidence:** MEDIUM-HIGH (core web APIs verified via official sources; version numbers from npm/GitHub)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vanilla JS + TypeScript | TS 5.9 | App logic, UI, audio orchestration | No framework overhead for a single-screen app with 9 tiles; TS 5.9 is the latest stable ES-standard version; TypeScript 6.0 is in beta (Go-native rewrite in 7.0 is alpha — do not use yet) |
| Vite | 7.x (7.3.1 latest) | Dev server, build, asset bundling | Industry-standard for vanilla/TS projects; lightning-fast HMR; pairs with vite-plugin-pwa for zero-config service worker generation; requires Node 20.19+ |
| vite-plugin-pwa | 1.x (1.1.0 latest) | PWA manifest + Workbox service worker | Zero-config; generates manifest and pre-caches all static assets; framework-agnostic; uses Workbox 7 internally |
| MediaRecorder API | Browser native | Audio capture via microphone | Supported in iOS Safari since iOS 14.5 (enabled by default); use `isTypeSupported()` for format detection; no library needed |
| Web Audio API / HTML `<audio>` | Browser native | Sound playback | HTML `<audio>` element for tap-to-play (handles iOS mute-switch correctly); Web Audio API for `AudioContext` unlock pattern and latency-critical playback |
| IndexedDB via idb-keyval | 6.2.2 | Persistent audio blob storage | Tiny (~600 B); promise-based key-value API on top of IndexedDB; authored by Jake Archibald (Google); simpler API than the full `idb` library — 9 blobs stored by tile index is a perfect key-value use case |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| idb-keyval | 6.2.2 | Store/retrieve audio Blob by tile key in IndexedDB | Always — raw IndexedDB API is verbose and error-prone |
| workbox-window | 7.x (via vite-plugin-pwa) | Communicate with service worker for update prompts | When adding "update available" UX (optional at MVP) |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vite 7 | Dev server + production build | `npm create vite@latest` with `vanilla-ts` template |
| vite-plugin-pwa | PWA manifest + service worker | Add to `vite.config.ts` as plugin; configure `manifest` inline |
| TypeScript 5.9 | Type safety | `strict: true` in tsconfig; use `moduleResolution: "bundler"` for Vite compatibility |
| ESLint + typescript-eslint | Lint | Catches iOS-incompatible patterns at author time |

---

## Installation

```bash
# Bootstrap
npm create vite@latest soundboard -- --template vanilla-ts
cd soundboard

# Storage
npm install idb-keyval

# PWA (dev dependency — build-time only)
npm install -D vite-plugin-pwa

# Lint (optional but recommended)
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

---

## iOS Safari Audio: Critical Constraints

This section is the most important part of this document. iOS Safari has unique, non-obvious constraints that will cause bugs if ignored.

### Constraint 1: AudioContext must be unlocked by a user gesture

**Applies to:** Web Audio API, `AudioContext`

iOS Safari starts every `AudioContext` in `suspended` state. You cannot play audio until the user has tapped something. Create one shared `AudioContext` instance and call `ctx.resume()` inside a `touchend` or `click` handler on the very first tap.

```typescript
// Create once, reuse everywhere
const audioCtx = new AudioContext();

// Call inside any user-gesture handler before first playback
async function unlockAudio() {
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
}
```

This is a one-time unlock — subsequent plays on the same context work fine.

### Constraint 2: HTML `<audio>` is safer than Web Audio API for simple playback

**Applies to:** Playback after recording

For this app (tap a tile → play a blob), use an `HTMLAudioElement` with an object URL (`URL.createObjectURL(blob)`). The `<audio>` element respects the iOS mute switch correctly (plays silently when muted) and doesn't require the `AudioContext` unlock ceremony for triggered playback. Web Audio API ignores the mute switch when using `AudioContext` directly.

Recommendation: Use `<audio>` for blob playback. Use `AudioContext` only if you need precise latency control or audio effects.

### Constraint 3: MediaRecorder on iOS only supports `audio/mp4` (AAC)

**Applies to:** Recording

iOS Safari does NOT support `audio/webm` or `audio/ogg`. The only format confirmed supported is `audio/mp4` with AAC codec. Always detect the format before initializing `MediaRecorder`:

```typescript
function getSupportedMimeType(): string {
  const candidates = [
    'audio/mp4;codecs=mp4a.40.2', // AAC-LC in MP4 — iOS Safari
    'audio/mp4',                   // MP4 fallback
    'audio/webm;codecs=opus',      // Chrome/Android
    'audio/webm',
    '',                            // browser default
  ];
  return candidates.find(t => t === '' || MediaRecorder.isTypeSupported(t)) ?? '';
}
```

Store the recorded blob's MIME type alongside the blob in IndexedDB — you need it to create the correct `<audio>` source.

### Constraint 4: `getUserMedia()` routes audio output to the built-in speaker

**Applies to:** Playback during or after an active recording session

When a `MediaStream` from `getUserMedia()` is active (even after recording stops), iOS Safari switches audio output from headphones to the built-in earpiece/speaker. This is an iOS system behavior with no clean fix. Mitigations:

1. Stop all microphone tracks (`track.stop()`) immediately after `mediaRecorder.stop()` fires the `dataavailable` event.
2. Add a small delay (100–200 ms) before playing back the just-recorded sound to give iOS time to re-route audio.
3. Document the behavior: users will hear playback from the speaker during recording; that is expected and not a bug.

### Constraint 5: No autoplay without user gesture

iOS Safari blocks all audio playback that is not triggered by a direct user interaction (tap, click). There is no workaround — every sound play must be initiated inside a synchronous event handler or a promise chain that originates in one.

For this app this is fine: every play is triggered by a tile tap.

### Constraint 6: Storage persistence for home screen PWAs

When the app is added to the home screen, IndexedDB data is NOT subject to the 7-day eviction rule that applies to Safari browser tabs (confirmed by WebKit's official storage policy update for iOS 17+). Home screen web apps have the same storage quota as the browser — up to 60% of total disk space.

However: call `navigator.storage.persist()` on first launch to request durable storage mode. This protects IndexedDB blobs from ITP-based eviction even under storage pressure.

```typescript
if (navigator.storage?.persist) {
  await navigator.storage.persist(); // returns true if granted
}
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vanilla TS + Vite | React / Vue / Svelte | If the app grows beyond one screen, adds routing, complex state, or a team with strong framework preferences |
| idb-keyval | Raw IndexedDB API | Never for this use case — raw API is 10x more verbose with no benefit for simple key-value access |
| idb-keyval | `idb` (full library) | If you need indexed queries, cursors, or complex relational data — not needed here |
| HTML `<audio>` for playback | Web Audio API + AudioBufferSourceNode | If you need precise timing, effects chain, or mixing; add complexity not justified for a soundboard |
| MediaRecorder API | RecordRTC / lamejs polyfill | Only if you must support iOS < 14.5. The project targets 14.3+ which enables MediaRecorder; however 14.3 and 14.4 marked it as "disabled by default" — document that 14.5 is the practical floor |
| vite-plugin-pwa | Hand-rolled service worker | Only for teams needing full control of caching strategies; vite-plugin-pwa covers the standard PWA install + offline shell pattern with zero config |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `localStorage` for audio blobs | localStorage is string-only; encoding blobs as base64 inflates size 33% and is synchronous (blocks main thread) | `idb-keyval` with native `Blob` storage |
| `audio/webm` as recording format | Not supported on iOS Safari at all; will throw on `MediaRecorder` init | Detect with `isTypeSupported()` and fall back to `audio/mp4` |
| Multiple `AudioContext` instances | Each instance holds audio hardware resources; iOS limits concurrent contexts | Create one shared `AudioContext`, unlock on first tap, reuse |
| `react` / `vue` for this scope | Adds 40–100 kB of framework JS for a 9-tile single-screen app that has no routing, no derived state, and minimal reactivity | DOM manipulation + a few custom events |
| TypeScript 6.0 or 7.0 | TypeScript 6.0 is in beta; TS 7.0 (Go rewrite) is alpha/unstable; tooling ecosystem compatibility is not confirmed | TypeScript 5.9 (current stable) |
| `navigator.mediaDevices.getUserMedia` in a `http://` context | iOS Safari requires HTTPS even on LAN for microphone access | Always serve PWA over HTTPS; Vite dev server can use `--https` flag with a local cert |

---

## Stack Patterns by Variant

**For MVP (single developer, ship fast):**
- Vanilla TS + Vite 7 + vite-plugin-pwa
- No UI library, no state manager
- CSS Grid for the 3×3 tile layout
- One `AudioContext` instance (module singleton)
- `idb-keyval` for all persistence
- `MediaRecorder` with `isTypeSupported()` format detection

**If adding audio effects (reverb, pitch shift) later:**
- Introduce `AudioContext` pipeline with `GainNode`, `ConvolverNode`, etc.
- Keep the existing `<audio>`-based playback as fallback

**If supporting Android/Chrome in addition to iOS:**
- Stack is identical — `audio/webm;codecs=opus` will be preferred by Chrome's `isTypeSupported()` detection automatically
- The format-detection pattern handles this without any conditional code

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| vite-plugin-pwa ^1.1.0 | Vite 7.x, Node 20.19+ | Requires Vite 5+ (verified); latest version confirmed compatible with Vite 7 in 2025 community guides |
| idb-keyval 6.2.2 | All modern browsers | Fully ESM; no CommonJS mode; works with Vite's ESM output |
| TypeScript 5.9 | Vite 7.x | Use `moduleResolution: "bundler"` in tsconfig for Vite |
| MediaRecorder API | iOS 14.5+ (enabled by default); iOS 14.3–14.4 (disabled by default, requires Settings toggle) | Minimum viable iOS target is 14.5 for reliable MediaRecorder support |

---

## Sources

- [WebKit blog — MediaRecorder API](https://webkit.org/blog/11353/mediarecorder-api/) — iOS MediaRecorder MIME types, format support (HIGH confidence)
- [Can I Use — MediaRecorder](https://caniuse.com/mediarecorder) — iOS 14.5 support timeline (HIGH confidence)
- [WebKit blog — Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/) — Home screen PWA storage quota and eviction rules (HIGH confidence)
- [Prototyp Digital — What we learned about PWAs and audio playback](https://blog.prototyp.digital/what-we-learned-about-pwas-and-audio-playback/) — Foreground-only audio, iOS PWA constraints (MEDIUM confidence)
- [addpipe.com — Record lossless audio in Safari](https://blog.addpipe.com/record-high-quality-audio-in-safari-with-alac-and-pcm-support-via-mediarecorder/) — Safari ALAC/PCM in Technology Preview; AAC stable release (MEDIUM confidence)
- [MagicBell — PWA iOS Limitations](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — Storage eviction, audio limitations summary (MEDIUM confidence)
- [npm — idb-keyval](https://www.npmjs.com/package/idb-keyval) — version 6.2.2, May 2025 (HIGH confidence)
- [Vite 7.0 release announcement](https://vite.dev/blog/announcing-vite7) — Vite 7.3.1 stable, Node 20.19+ requirement (HIGH confidence)
- [GitHub — soundboard-pwa reference implementation](https://github.com/digitalcolony/soundboard-pwa) — Vanilla JS + Vite + Workbox pattern validation (MEDIUM confidence)
- [Medium — iOS Safari forces audio to speakers with getUserMedia](https://medium.com/@python-javascript-php-html-css/ios-safari-forces-audio-output-to-speakers-when-using-getusermedia-2615196be6fe) — Speaker routing issue and workarounds (MEDIUM confidence)
- [TypeScript release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html) — TS 5.9 stable, TS 6.0 beta status (HIGH confidence)
- [dirask.com — Supported MIME types by MediaRecorder](https://dirask.com/posts/JavaScript-supported-Audio-Video-MIME-Types-by-MediaRecorder-Chrome-Firefox-and-Safari-jERn81) — Cross-browser format matrix (MEDIUM confidence)

---

*Stack research for: iPhone PWA Soundboard*
*Researched: 2026-02-22*
