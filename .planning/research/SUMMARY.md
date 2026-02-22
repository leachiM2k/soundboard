# Project Research Summary

**Project:** iPhone PWA Soundboard
**Domain:** Mobile PWA — personal audio recorder/player, local-only, 9-tile fixed grid
**Researched:** 2026-02-22
**Confidence:** HIGH (stack, pitfalls) / MEDIUM-HIGH (features, architecture)

## Executive Summary

This is a single-screen iPhone PWA that records voice clips via microphone and plays them back on demand — no server, no App Store, no cloud sync. The correct build approach is Vanilla TypeScript + Vite 7 + vite-plugin-pwa: no UI framework is warranted for a fixed 9-tile single-screen app, and adding one costs 30-100 KB of JS for zero architectural benefit. All audio blobs are stored in IndexedDB (via idb-keyval) and audio pipeline work uses native Web Audio API and MediaRecorder. The app is installable to the iPhone home screen and works offline after install.

The iOS Safari platform is the central technical challenge. Safari imposes a strict user-gesture requirement before any AudioContext can play audio, enforces a 4-instance limit on AudioContext objects, supports only audio/mp4 (AAC) for MediaRecorder output (not WebM/Opus), routes audio output to the built-in speaker while a microphone session is active, and silences all Web Audio when the hardware mute switch is engaged. Every one of these constraints must be handled in Phase 1 audio infrastructure, because retrofitting them later is expensive. The architecture must build the audio pipeline first, verify it on a real iPhone, and only then build the UI on top.

The primary risks are iOS audio edge cases that are invisible in desktop testing and the 7-day IndexedDB eviction in Safari browser mode (mitigated by guiding users to install to home screen and calling `navigator.storage.persist()`). The product is deliberately minimal: 9 fixed tiles, microphone-only input, no labels, no cloud. Resisting scope expansion (more tiles, file import, cloud sync) is as important as building the core correctly.

---

## Key Findings

### Recommended Stack

The entire app runs on web platform primitives with three dependencies: `idb-keyval` for IndexedDB access, `vite-plugin-pwa` for service worker generation, and TypeScript 5.9 for type safety. No UI framework. No state management library. No audio library. Vite 7 (requires Node 20.19+) handles dev server and production builds with near-zero config.

For audio, use `MediaRecorder` (native browser API) for recording with runtime format detection via `isTypeSupported()`, and Web Audio API (`AudioContext` + `AudioBufferSourceNode`) for playback. Do not use `HTMLAudioElement` for playback — it has 300-500ms latency on iOS Safari, the wrong tool for a soundboard. Do not use localStorage for blobs (string-only, synchronous, 33% size inflation from base64). Do not use the Cache API for user recordings (7-day eviction, 50 MB limit).

**Core technologies:**
- Vanilla TypeScript 5.9 + Vite 7: app logic, UI, audio orchestration — no framework overhead for a 9-tile single-screen app
- vite-plugin-pwa 1.x: PWA manifest + Workbox service worker — zero-config install + offline shell generation
- MediaRecorder API (browser native): audio capture — supported on iOS 14.5+; must use `isTypeSupported()` for format detection
- Web Audio API (browser native): audio playback — `AudioContext` singleton, unlock on first tap, `AudioBufferSourceNode` per play
- idb-keyval 6.2.2: IndexedDB blob storage — 600 B, promise-based, perfect key-value fit for 9 slots

### Expected Features

Research identifies a tight MVP: the core loop is "tap empty tile to record, tap again to stop, tap filled tile to play." Everything else is enhancement or explicit anti-feature.

**Must have (table stakes) — v1:**
- Tap to play sound with interrupt-on-re-tap — the entire premise; must be near-instant
- Tap-to-start / tap-to-stop recording — simpler and better than hold-to-record for arbitrary-length clips
- Visual empty vs. filled tile state — users cannot orient themselves without it
- Recording active indicator (pulsing animation) — users must know the mic is live
- Long-press context menu: Delete and Re-record — essential management
- Confirmation dialog on delete — prevents accidental data loss
- Sound persistence in IndexedDB across sessions — any loss of recordings destroys trust
- Microphone permission requested on first record attempt, not on load
- AudioContext unlocked on first user interaction — hard iOS prerequisite, invisible to user
- PWA manifest + service worker + HTTPS — required for home screen install
- Offline capability after install

**Should have (competitive) — v1.x:**
- Haptic feedback on tap/record — feels native, 10-15ms vibrate via `navigator.vibrate()`
- Recording waveform visualizer — validates mic is capturing, mitigates mute-switch confusion
- Pre-decoded audio buffer cache — eliminates any decode latency on repeat plays
- Graceful microphone re-prompt handling for PWA standalone mode (WebKit bug #215884)

**Defer (v2+):**
- Full-screen display mode / safe-area inset polish for notched iPhones
- Storage usage indicator
- iOS 16.4+ install prompt hint UI
- Any kind of cloud sync, file import, or label system — explicit anti-features, not deferred features

**Explicit anti-features (never build):**
- Text labels on tiles (breaks zero-friction flow, forces label-entry UI)
- More than 9 tiles (destroys single-screen constraint)
- Cloud sync / backup (requires backend, auth, GDPR handling)
- Import audio files (scope explosion, breaks "your voice" value prop)
- Hold-to-record (fatiguing for long clips, breaks on accidental release)
- Per-tile volume control (this is not a mixer)
- Simultaneous sound overlap (cacophony; use interrupt-on-tap instead)

### Architecture Approach

The app has four layers: UI (TileView components), a State Controller (9-slot array, single source of truth), Audio Pipeline (Recorder and Player modules), and Storage (IndexedDB via idb-keyval). All layers communicate through the State Controller — tiles never call audio or DB APIs directly. The Service Worker handles only the app shell (HTML/CSS/JS); audio blobs are never stored in Cache API. This separation allows each module to be built and tested independently.

**Major components:**
1. State Controller (`state/store.js`) — 9-slot array with explicit state machine per slot (`empty → recording → saving → has-sound`); orchestrates all transitions; single source of truth
2. Recorder (`audio/recorder.js`) — MediaRecorder wrapper with format detection; emits blob on stop; stateless between recordings
3. Player (`audio/player.js`) — AudioContext singleton with unlock logic; decodes blob to AudioBuffer; plays via BufferSourceNode
4. Storage API (`storage/db.js`) — idb-keyval wrapper; loads all slots on boot, persists blob+mimeType on save, deletes on remove
5. TileView (`components/tile.js`) — pure rendering; reflects state via CSS classes; emits tap and long-press events upward
6. ContextMenu (`components/context-menu.js`) — long-press overlay with Delete/Re-record; dispatches to State Controller
7. Service Worker — caches app shell only; generated by vite-plugin-pwa

**Build order (based on architectural dependencies):**
Storage → Format detection → Recorder → Player → State Controller → TileView → ContextMenu → App bootstrap → Service Worker

### Critical Pitfalls

1. **AudioContext requires user gesture unlock** — Create one shared `AudioContext` singleton; call `audioContext.resume()` inside the very first `touchend` or `click` handler before any playback. Safari silently fails (no error, no audio) if this is skipped. Also handle `"interrupted"` state (phone calls, notifications) by calling `resume()` at the start of every tap handler. Never create more than one AudioContext — Safari hard-limits at 4 instances.

2. **HTMLAudioElement latency makes it wrong for soundboard** — `HTMLAudioElement` has 300-500ms delay on iOS Safari. Use Web Audio API exclusively: decode blobs to `AudioBuffer` on app startup and play via `AudioBufferSourceNode`. This gives near-zero latency. This is not retrofittable — choose Web Audio from day one.

3. **MediaRecorder iOS format incompatibility** — iOS Safari only supports `audio/mp4` (AAC); WebM/Opus throws `NotSupportedError`. Always use `MediaRecorder.isTypeSupported()` at startup and store the detected MIME type alongside every blob in IndexedDB. Never hardcode `audio/webm`.

4. **IndexedDB eviction in Safari browser mode** — Recordings in Safari browser tabs (not installed as PWA) are evicted after 7 days of inactivity. Mitigation: call `navigator.storage.persist()` on first launch, show a one-time "Add to Home Screen" prompt before users record anything valuable.

5. **Long-press collides with iOS Safari native callout** — The `contextmenu` event does not fire reliably on iOS. Implement long-press via `touchstart` → 500ms timer with `touchend`/`touchmove` cancellation. Use `-webkit-touch-callout: none` + `-webkit-user-select: none` CSS plus `contextmenu` `preventDefault()`. CSS alone is broken in iOS 15-26; JS backup is mandatory.

6. **Microphone re-permission prompts in standalone PWA mode** — WebKit bug #215884 ties microphone permission to the exact URL. Never use URL hash changes or pushState navigation. Keep the app on a single URL (`/`) and use in-memory state only. Reuse the `MediaStream` object across recordings rather than calling `getUserMedia` repeatedly.

---

## Implications for Roadmap

Based on combined research, the pitfall-to-phase mapping and architectural build order both converge on the same phase structure: audio infrastructure first, then UI, then PWA polish, then UX enhancements.

### Phase 1: Audio + Storage Infrastructure

**Rationale:** All iOS Safari audio constraints (AudioContext unlock, format detection, latency) must be resolved before UI is built on top. Retrofitting these is HIGH cost (full subsystem rewrite). Architecture research explicitly recommends building and verifying the audio pipeline on a real iOS device before adding UI. Storage must be correct from the start to avoid data loss.

**Delivers:** Working audio record → store → play pipeline; correct MIME type detection; idb-keyval storage layer; AudioContext singleton with unlock + interrupted-state recovery; `navigator.storage.persist()` call.

**Addresses:** Tap-to-record (start/stop), tap-to-play, sound persistence, AudioContext unlock, microphone permission on demand.

**Avoids:** AudioContext user-gesture pitfall, HTMLAudioElement latency pitfall, MediaRecorder MIME type pitfall, IndexedDB eviction pitfall, microphone re-permission pitfall. These all have HIGH recovery cost if addressed later.

**Research flag:** Standard patterns (MDN + WebKit official docs cover all of this). No additional research needed.

### Phase 2: Tile UI and Interaction Layer

**Rationale:** TileView and ContextMenu depend on the State Controller which depends on the audio pipeline being defined. Build the UI after the audio contract is stable. Long-press handling must be built correctly from day one (MEDIUM recovery cost if retrofitted).

**Delivers:** 3x3 grid layout (CSS Grid); TileView rendering with empty/recording/has-sound states; tap event handling; long-press context menu with Delete and Re-record; recording active indicator (pulsing animation); confirmation dialog for delete; AudioContext unlock wired to first tap.

**Addresses:** Visual empty vs. filled tile distinction, recording active indicator, long-press management actions, interrupt-on-re-tap playback behavior.

**Avoids:** Long-press native callout pitfall (build touch event handling correctly from the start); accidental recording start on long-press (distinguish short-tap vs. long-press timing at 400-500ms threshold).

**Research flag:** Standard patterns. CSS Grid and custom touch events are well-documented. Test long-press on real device, not simulator.

### Phase 3: PWA Shell and Offline

**Rationale:** Service worker should be added as a dedicated step, not bundled with feature work. Offline-first behavior requires explicit testing (offline launch from Home Screen). Architecture research recommends service worker last in build order since app works without it during development.

**Delivers:** vite-plugin-pwa configuration with manifest; app shell precache (HTML, CSS, JS, icons); offline launch from Home Screen; `apple-touch-icon` meta tag for iOS home screen icon; `display: standalone` + `viewport-fit=cover` for full-screen appearance; HTTPS (required for `getUserMedia`).

**Addresses:** PWA installability, offline-first capability, full-screen standalone appearance.

**Avoids:** Service worker cache conflict pitfall (version cache names, delete old caches on activate); Cache API for audio blobs (never — blobs stay in IndexedDB); missing `apple-touch-icon` (iOS ignores manifest icons for home screen).

**Research flag:** Standard patterns. vite-plugin-pwa is zero-config for this use case. Mandatory: test offline launch from home screen with airplane mode before marking phase complete.

### Phase 4: UX Polish and Resilience

**Rationale:** These features add significant perceived quality but have no blocking dependencies. Safe to defer past core functionality validation. User feedback from real device testing will prioritize this work.

**Delivers:** Haptic feedback (`navigator.vibrate()`, 10-15ms on play, 30ms on record start/stop); recording waveform visualizer (Canvas or CSS + `AnalyserNode`); pre-decoded AudioBuffer cache on boot (eliminates repeat-play latency); graceful microphone re-prompt UX for standalone WebKit bug; one-time "Add to Home Screen" hint shown in Safari browser mode.

**Addresses:** Haptic feedback, waveform visualizer, immediate playback readiness, IndexedDB eviction guidance for non-installed users.

**Avoids:** Mute-switch silence confusion (waveform animation shows app is alive even without sound output); data eviction for non-installed users (Home Screen install prompt shown before first recording).

**Research flag:** Waveform visualizer (AnalyserNode integration) may benefit from a quick look at Canvas API docs if unfamiliar. Everything else is straightforward.

### Phase Ordering Rationale

- Audio infrastructure before UI because iOS Safari audio bugs have HIGH recovery cost and zero visibility in the simulator — they must be found and fixed on a real device before the UI is built on top.
- UI before PWA because the service worker is the last dependency in the architectural build order and the app functions correctly without it during development.
- PWA shell before UX polish because installation is a prerequisite for testing data persistence and standalone-mode permission behavior.
- UX polish last because it enhances a working product rather than enabling it.

### Research Flags

Phases with standard, well-documented patterns — skip additional research:
- **Phase 1 (audio + storage):** Web Audio API and MediaRecorder are documented in MDN and official WebKit blog posts. Patterns are proven.
- **Phase 2 (tile UI):** CSS Grid and custom touch event handling are standard. No novel patterns.
- **Phase 3 (PWA shell):** vite-plugin-pwa is zero-config for single-screen apps.

Phases that may need targeted research during implementation:
- **Phase 4 (waveform visualizer):** AnalyserNode + Canvas or CSS animation integration is moderately complex. If the implementer is not familiar with the Web Audio AnalyserNode API, a focused research spike is worthwhile before writing code.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core technologies verified against official sources (WebKit blog, Vite 7 release notes, npm registry, TypeScript release notes). Version numbers confirmed current. |
| Features | HIGH (core) / MEDIUM (PWA constraints) | Table-stakes features are obvious from domain. PWA-specific constraints (permission re-prompt bug, eviction behavior) verified across multiple sources including WebKit bug tracker. |
| Architecture | HIGH (core pipeline) / MEDIUM (iOS edge cases) | Component structure and data flow are well-established for this pattern. iOS edge cases documented via WebKit blogs and community post-mortems. |
| Pitfalls | HIGH | Multiple independent sources agree on all 9 pitfalls. WebKit bug tracker references provided for platform bugs. Recovery costs are accurately assessed. |

**Overall confidence: HIGH**

The domain is well-researched. The iOS Safari constraints are the one area of genuine complexity, and they are thoroughly documented. No major architectural unknowns remain. The main execution risk is missing iOS-specific bugs during development by testing on desktop instead of a real iPhone.

### Gaps to Address

- **Mute switch (hardware ringer):** There is no reliable API to detect mute state from JavaScript in a PWA. The mitigation (visual waveform animation so users can tell the app is working) is the correct approach, but users who do not understand why they hear no sound will still be confused. Consider a first-run hint about the mute switch.
- **iOS 14.5 minimum target:** MediaRecorder is enabled by default from 14.5. iOS 14.3 and 14.4 have it disabled by default (requires a Settings toggle). If the user base includes iOS 14.3/14.4 devices, a compatibility check and graceful degradation message is needed. If targeting iOS 15+, this is a non-issue.
- **Service worker update UX:** vite-plugin-pwa provides `workbox-window` for communicating app updates to users. The MVP does not need this, but skipping it entirely means users may run stale cached versions indefinitely. Worth noting as a v1.x concern.
- **Real device testing cadence:** The simulator does not enforce the AudioContext user-gesture requirement the same way a real iPhone does. All audio testing must happen on a physical iPhone. This is an execution constraint, not a research gap, but it must be planned for.

---

## Sources

### Primary (HIGH confidence)
- WebKit Blog — MediaRecorder API: https://webkit.org/blog/11353/mediarecorder-api/ — iOS MIME types, format support
- WebKit Blog — Updates to Storage Policy: https://webkit.org/blog/14403/updates-to-storage-policy/ — IndexedDB eviction, home screen PWA quota
- Vite 7.0 release announcement: https://vite.dev/blog/announcing-vite7 — version and Node requirements
- TypeScript release notes (5.9): https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html — stable version confirmed
- npm — idb-keyval 6.2.2: https://www.npmjs.com/package/idb-keyval — version, API, size
- Can I Use — MediaRecorder: https://caniuse.com/mediarecorder — iOS 14.5 support timeline
- MDN — Web Audio API Best Practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN — Storage quotas and eviction criteria: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

### Secondary (MEDIUM confidence)
- Prototyp Digital — What we learned about PWAs and audio playback: https://blog.prototyp.digital/what-we-learned-about-pwas-and-audio-playback/
- MagicBell — PWA iOS Limitations: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- Build with Matija — iPhone Safari MediaRecorder: https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription
- Matt Montag — Unlock Web Audio in Safari/iOS: https://www.mattmontag.com/unlock-web-audio-in-safari-for-ios-and-macos
- Brainhub — PWA on iOS 2025: https://brainhub.eu/library/pwa-on-ios
- Medium — iOS Safari forces audio output to speakers with getUserMedia: https://medium.com/@python-javascript-php-html-css/ios-safari-forces-audio-output-to-speakers-when-using-getusermedia-2615196be6fe
- GitHub — soundboard-pwa reference implementation: https://github.com/digitalcolony/soundboard-pwa

### WebKit Bug Tracker (HIGH confidence for platform behaviors)
- Bug #215884 — getUserMedia recurring permission prompts in standalone: https://bugs.webkit.org/show_bug.cgi?id=215884
- Bug #237878 — AudioContext suspended when page backgrounded: https://bugs.webkit.org/show_bug.cgi?id=237878
- Bug #237322 — Web Audio muted when ringer is muted: https://bugs.webkit.org/show_bug.cgi?id=237322
- Bug #198277 — Background audio stops in standalone PWA: https://bugs.webkit.org/show_bug.cgi?id=198277

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
