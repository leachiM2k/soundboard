# Feature Research

**Domain:** Mobile soundboard PWA (personal, microphone-only, local storage)
**Researched:** 2026-02-22
**Confidence:** HIGH (core features) / MEDIUM (PWA-specific constraints verified across multiple sources)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tap to play sound | The entire premise of a soundboard | LOW | Must be near-instant. Any perceptible delay breaks the core promise. AudioContext must be pre-unlocked on first interaction. |
| Visual distinction: empty vs. filled tile | Users cannot identify purpose without visual cue | LOW | Empty = prompt to record. Filled = tap to play. Color, icon, or opacity difference sufficient. |
| Tap-to-start / tap-to-stop recording | Intuitive capture flow for arbitrary-length sounds | MEDIUM | Start on tap, stop on second tap. Simpler than hold-to-record for long sounds. Status must be obvious during recording. |
| Recording active indicator | User must know recording is in progress | LOW | Pulsing animation, border highlight, or countdown. Without this, users do not know to speak. |
| Sounds persist across sessions | Users expect their data to survive app restart | MEDIUM | IndexedDB + Blob storage. Must survive page reload and Safari navigation. |
| Delete a recorded sound | Users need to correct mistakes | LOW | Accessible via long-press menu. Confirmation step recommended to prevent accidental deletion. |
| Re-record a sound slot | Users record suboptimal takes and want to redo | LOW | Long-press → "Re-record" option. Must confirm if overwriting existing sound. |
| Microphone permission request | iOS requires explicit consent | LOW | Request only on first record attempt, not on app load. Use getUserMedia on demand. |
| PWA installability (Add to Home Screen) | Expected for app-like experience on iPhone | MEDIUM | Requires HTTPS, manifest.json with icons, service worker. iOS does not auto-prompt; user initiates via Share sheet. |

### Differentiators (Competitive Advantage)

Features that elevate this app beyond a minimal demo. Aligned with the core value: "one button, one sound, immediately."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Haptic feedback on tap | Physical confirmation the button was pressed; feels native | LOW | Use `navigator.vibrate()`. Works in iOS Safari standalone mode. Brief pulse (10–15ms) on play, longer (30ms) on record start/stop. |
| Play behavior: interrupt on re-tap | Tapping a playing tile restarts or stops it — prevents overlapping chaos | LOW | Track `AudioBufferSourceNode` per tile. Stop before re-playing. Single-tile interrupt is the natural soundboard expectation. |
| Visual recording waveform / pulse | Real-time microphone level shows the mic is picking up sound | MEDIUM | Canvas or CSS animation reading `AnalyserNode`. Validates that recording is actually capturing audio, not silence. |
| Smooth, app-like full-screen experience | Feels installed, not browser tab | LOW | `display: standalone` in manifest, `apple-mobile-web-app-capable`, status bar meta, `viewport-fit=cover`. Removes Safari chrome. |
| Offline-first | Works without network after install | LOW | Service worker caches app shell. All sounds in IndexedDB. No network dependency post-install. |
| Compressed audio storage | More sounds fit; faster playback load | MEDIUM | MediaRecorder with `audio/mp4` (AAC on iOS Safari) or `audio/webm;codecs=opus` (Chrome). iOS Safari produces AAC natively — storage-efficient by default. |
| Immediate playback readiness | No lag on first tap of a filled tile | MEDIUM | Decode audio blob to `AudioBuffer` on load or lazily on first access. Cache decoded buffer in memory. Pre-decode on app start for all filled tiles. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem attractive but actively harm this product's goals.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Text labels on tiles | "How will I remember which sound is which?" | Adds a label-entry UI step, breaks the zero-friction flow, clutters the minimal grid | Trust positional memory. 9 tiles in a 3x3 grid is a well-understood spatial map. Scope-out as stated in PROJECT.md. |
| More than 9 tiles / scrolling | "I need more sounds!" | Destroys the single-screen constraint; forces navigation; working memory overload; completely changes the product | Ruthlessly stay at 9. If user needs more, the product category shifts. |
| Cloud sync / backup | "What if I get a new phone?" | Requires backend, auth, GDPR handling, network dependency — turns a zero-infrastructure app into a service | LocalStorage is the design. Frame "install on each device" as the pattern. |
| Import audio files | "I want to use my MP3" | Needs file-picker UI, format conversion, size validation — scope explosion. Also breaks the "your voice" value proposition. | Microphone-only recording as stated in PROJECT.md. |
| Hold-to-record (press and hold) | Seems intuitive | Very bad for sounds longer than 10 seconds (fatigue) and breaks on accidental releases | Tap-to-start / tap-to-stop is strictly better for arbitrary-length personal recordings. |
| Undo delete | "I deleted by accident" | Adds state complexity (deleted-but-recoverable), requires holding audio in memory after deletion | Confirmation dialog on delete is sufficient protection. Keep state simple. |
| Volume control per tile | Professional users expect it | Adds settings UI per tile; this app is not a mixer | Global device volume is the control surface. Keep tiles stateless beyond audio data. |
| Real-time playback simultaneous overlap | "I want to stack sounds" | Cacophony. Personal soundboards primarily use one sound at a time. Multiple concurrent AudioNodes compound memory pressure on mobile. | Interrupt-on-tap behavior. Tapping a playing tile stops and restarts it. |
| Background audio playback | "It keeps stopping when I lock the screen" | iOS aggressively suspends PWA background processes; implementing this requires Media Session API + significant complexity with unreliable behavior | Design around the constraint: the soundboard is a foreground interaction tool. |

---

## Feature Dependencies

```
[Microphone Permission]
    └──required-by──> [Tap-to-record]
                          └──required-by──> [Sound Storage in IndexedDB]
                                                └──required-by──> [Tap to Play]
                                                └──required-by──> [Delete Sound]
                                                └──required-by──> [Re-record Sound]

[AudioContext (unlocked on first user tap)]
    └──required-by──> [Tap to Play]
    └──required-by──> [Recording Waveform Visualizer]

[Service Worker]
    └──required-by──> [PWA Installability]
    └──required-by──> [Offline-first]

[PWA Manifest + HTTPS]
    └──required-by──> [PWA Installability]
    └──required-by──> [Full-screen Standalone Mode]

[Tap to Play]
    └──enhanced-by──> [Haptic Feedback]
    └──enhanced-by──> [Play Interrupt Behavior]
    └──enhanced-by──> [Immediate Playback Readiness (pre-decoded buffer)]

[Tap-to-record]
    └──enhanced-by──> [Recording Active Indicator]
    └──enhanced-by──> [Recording Waveform Visualizer]
```

### Dependency Notes

- **AudioContext must be unlocked before any sound plays:** iOS Safari silences AudioContext until the first user gesture. The very first tap anywhere in the app must call `audioContext.resume()`. This is not optional — it is a hard iOS platform requirement.
- **Microphone permission requires user gesture:** `getUserMedia()` must be called from a tap event, not on app load. iOS may re-prompt on each app open when running as standalone PWA (known WebKit bug, unfixed as of 2025).
- **Pre-decoded buffers depend on sounds existing in IndexedDB:** Decode-on-load optimization only applies to tiles that already have audio stored. Empty tiles have no buffer.
- **Service worker is gating for offline-first and installability:** Both features require a registered service worker. This is a Phase 1 infrastructure concern — ship service worker early.
- **Full-screen standalone conflicts with Safari permission persistence bug:** When running as an installed PWA in standalone mode, getUserMedia may re-prompt for microphone access on each launch. This is a known WebKit bug (bugs.webkit.org/215884). Design UX to handle re-prompt gracefully, not as an error state.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — validates the core premise: "one button, one sound, immediately."

- [ ] 3x3 grid of round tiles, full screen, no scrolling — spatial foundation
- [ ] Tap empty tile → start recording → tap again → stop and save — core capture flow
- [ ] Tap filled tile → play sound (interrupt if already playing) — core playback
- [ ] Visual distinction: empty vs. filled state — orientation without labels
- [ ] Recording active indicator (pulsing border or animation) — feedback that mic is live
- [ ] Long-press filled tile → context menu (Delete / Re-record) — management
- [ ] Confirmation dialog for Delete — prevent accidental data loss
- [ ] Sound stored in IndexedDB as Blob, survives session — persistence
- [ ] Microphone permission requested on first record attempt — correct flow
- [ ] AudioContext unlocked on first user interaction — iOS playback prerequisite
- [ ] PWA manifest + service worker + HTTPS — installable to Home Screen
- [ ] Offline capable after install — no network dependency

### Add After Validation (v1.x)

Add when the core is shipped and user feedback confirms value.

- [ ] Haptic feedback on tap/record — sensory polish, low effort, high feel payoff
- [ ] Recording waveform visualizer — confidence that mic is actually capturing audio
- [ ] Pre-decoded audio buffer cache — eliminates any latency on repeat plays
- [ ] Graceful re-prompt handling for microphone permission (PWA standalone bug) — reduce friction for installed users

### Future Consideration (v2+)

Defer until product-market fit is confirmed and the scope justifies complexity.

- [ ] Full-screen display mode optimization (viewport-fit, safe-area insets on notched iPhones) — polish for varied hardware
- [ ] Storage usage indicator — inform users if IndexedDB is approaching limits (unlikely for 9 short recordings)
- [ ] iOS 16.4+ install prompt hint UI — guide user through Share → Add to Home Screen flow since iOS does not auto-prompt

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Tap to play | HIGH | LOW | P1 |
| Tap-to-record (start/stop) | HIGH | MEDIUM | P1 |
| Visual empty vs. filled tile | HIGH | LOW | P1 |
| Sound persistence (IndexedDB) | HIGH | MEDIUM | P1 |
| Recording active indicator | HIGH | LOW | P1 |
| Delete / re-record via long press | HIGH | LOW | P1 |
| AudioContext unlock (iOS) | HIGH | LOW | P1 — invisible but critical |
| Microphone permission on demand | HIGH | LOW | P1 |
| PWA manifest + service worker | HIGH | MEDIUM | P1 |
| Offline-first | HIGH | LOW | P1 — follows from service worker |
| Interrupt on re-tap | MEDIUM | LOW | P1 — prevents audio chaos |
| Haptic feedback | MEDIUM | LOW | P2 |
| Recording waveform visualizer | MEDIUM | MEDIUM | P2 |
| Pre-decoded buffer cache | MEDIUM | MEDIUM | P2 |
| Graceful re-prompt UX | MEDIUM | LOW | P2 |
| Full-screen / safe-area polish | LOW | LOW | P3 |
| Storage usage indicator | LOW | LOW | P3 |
| Install prompt hint UI | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Soundboard Studio (iOS) | MyInstants (iOS) | Our Approach |
|---------|------------------------|-----------------|--------------|
| Grid layout | Flexible grid, multiple boards, scrollable | Large library grid, paginated | Fixed 3x3, single screen, no scroll |
| Recording | Hold to record | No recording (predefined sounds) | Tap-to-start / tap-to-stop |
| Labels | Text labels + icons | Text labels | No labels (positional memory) |
| Sound source | File import + recording | Online library | Microphone-only |
| Storage | iCloud sync | Cloud | Local IndexedDB only |
| Tile count | Up to 8x8 per board, multi-board | Hundreds (paginated) | 9 (fixed) |
| Haptic feedback | Unknown | Yes (v5.0+) | Yes (v1.x) |
| PWA | No (native app) | No (native app) | Yes — no App Store required |
| Waveform | Waveform editor on trim | No | Recording visualizer (v1.x) |

**Key differentiator of our approach:** Zero infrastructure, zero App Store friction, optimized for personal voice sounds only, radical simplicity. Competitors optimize for scale and variety; we optimize for speed and immediacy.

---

## PWA-Specific Feature Constraints

These are not features to build — they are platform constraints that shape how features must be implemented.

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| AudioContext requires user gesture on iOS | Cannot pre-warm audio on page load | Unlock AudioContext on the very first tap anywhere in the app |
| getUserMedia re-prompts on each PWA launch (WebKit bug) | Users see permission dialog every session | Design the re-prompt as a normal first-run step, not an error; do not store "permission granted" assumption |
| iOS Safari audio output switches to speaker when using getUserMedia | Earpiece audio may route to speaker during/after recording | Acceptable for a soundboard — output to speaker is correct behavior |
| IndexedDB data eviction after ~7 days of inactivity on iOS | Sounds could disappear if app unused | Note in documentation; acceptable trade-off for personal tool. Consider periodic "keepalive" read to reset eviction timer in v2. |
| No automatic install prompt on iOS | Users cannot be prompted to install | Show one-time "Add to Home Screen" hint in app UI; do not be aggressive about it |
| Standalone mode may lose Safari tab context | Some web APIs behave differently standalone | Test all critical paths (recording, playback, permission) in standalone mode specifically |
| MediaRecorder on iOS produces MP4/AAC (not WebM/Opus) | Format varies by browser | Use `MediaRecorder.isTypeSupported()` to detect format dynamically; store with correct MIME type in IndexedDB |

---

## Sources

- [Soundboard Studio iOS App](https://soundboardstudio.com/) — competitor feature analysis
- [MyInstants Soundboard](https://apps.apple.com/au/app/myinstants-soundboard-buttons/id1046474775) — competitor feature analysis
- [PWA on iOS 2025 — Brainhub](https://brainhub.eu/library/pwa-on-ios) — iOS PWA limitation overview
- [PWA iOS Limitations — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — 50MB cache limit, 7-day eviction detail
- [MediaRecorder API on WebKit](https://webkit.org/blog/11353/mediarecorder-api/) — official Safari MediaRecorder documentation
- [iPhone Safari MediaRecorder + Transcription](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription) — format detection pattern (isTypeSupported)
- [What PWA Can Do Today — Audio Recording](https://whatpwacando.today/audio-recording/) — current capability verification
- [getUserMedia recurring permissions bug — WebKit](https://bugs.webkit.org/show_bug.cgi?id=215884) — standalone PWA permission re-prompt bug
- [getUserMedia standalone mode bug — WebKit](https://bugs.webkit.org/show_bug.cgi?id=185448) — getUserMedia not working in homescreen standalone mode
- [iOS Safari forces speaker on getUserMedia](https://medium.com/@python-javascript-php-html-css/ios-safari-forces-audio-output-to-speakers-when-using-getusermedia-2615196be6fe) — audio routing behavior
- [Unlock Web Audio in Safari — Matt Montag](https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos) — AudioContext unlock pattern
- [PWA Add to Home Screen 2025](https://www.gomage.com/blog/pwa-add-to-home-screen/) — manifest requirements, iOS install flow
- [Vinova — Safari iOS PWA Limitations](https://vinova.sg/navigating-safari-ios-pwa-limitations/) — standalone mode quirks

---
*Feature research for: iPhone PWA Soundboard (personal, microphone-only, 9 fixed tiles)*
*Researched: 2026-02-22*
