# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Ein Knopf drücken, ein Sound ertönt — sofort, zuverlässig, ohne Umwege.
**Current focus:** Phase 3 — PWA Shell and Offline

## Current Position

Phase: 3 of 3 (PWA Shell and Offline) — COMPLETE
Plan: 3 of 3 in current phase (03-03 complete)
Status: Project complete — all 3 phases done; iPhone Safari verification passed for all PWA requirements
Last activity: 2026-02-22 — Plan 03-03 complete; iPhone Safari verification passed; all PWA requirements confirmed

Progress: [██████████] 100% (Phase 1 done + Phase 2 done + Phase 3 done)

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: ~4 minutes
- Total execution time: ~0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Audio and Storage Pipeline | 4/4 | ~27 min | ~7 min |
| 2. Tile UI and Interaction | 2/4 | ~4 min | ~2 min |
| 3. PWA Shell and Offline | 3/3 | ~6 min + verification | ~3 min |

**Recent Trend:**
- Last 5 plans: 01-01 (~7 min), 01-02 (~1 min), 01-03 (~1 min), 01-04 (~15 min including iPhone verification), 02-01 (~2 min)
- Trend: Stable; device verification adds real-world overhead

*Updated after each plan completion*
| Phase 01-audio-and-storage-pipeline P04 | 15 | 3 tasks | 4 files |
| Phase 02-tile-ui-and-interaction P01 | 2 | 3 tasks | 4 files |
| Phase 02-tile-ui-and-interaction P02 | 2 | 2 tasks | 4 files |
| Phase 02-tile-ui-and-interaction P03 | 2 | 2 tasks | 5 files |
| Phase 03-pwa-shell-and-offline P01 | 4 | 2 tasks | 7 files |
| Phase 03-pwa-shell-and-offline P02 | 2 | 2 tasks | 4 files |
| Phase 03-pwa-shell-and-offline P03 | checkpoint | 2 tasks | 0 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-Phase 1]: Web Audio API over HTMLAudioElement — 300-500ms iOS latency makes HTMLAudioElement wrong for soundboard; must use AudioContext from day one
- [Pre-Phase 1]: Build audio pipeline before UI — iOS Safari AudioContext and MediaRecorder pitfalls have HIGH recovery cost if discovered after UI is built
- [01-01]: Manual scaffold instead of npm create vite — non-empty directory caused npm create vite to cancel; all vanilla-ts template files created explicitly
- [01-01]: idb-keyval pinned at 6.2.2 — exact version specified in plan to ensure reproducible builds
- [01-01]: MIME probe order: webm;codecs=opus > webm > mp4 > ogg;codecs=opus — covers all major browsers with iOS Safari mp4 as fallback
- [01-02]: MediaRecorderOptions (not MediaRecorderInit) — TypeScript 5.8.3 DOM lib uses MediaRecorderOptions; MediaRecorderInit does not exist
- [01-02]: audioBitsPerSecond intentionally absent — iOS Safari may ignore it; AAC default is acceptable for 30s mono speech
- [01-02]: recorder.start() with no timeslice — chunked recording with short timeslices is unreliable on iOS Safari
- [01-03]: AudioBuffer cached per tile after first decode — balances startup speed and repeat-play latency; cleared on recording delete/replace
- [01-03]: decodeAudioData failure propagates to caller — defective blobs NOT deleted from storage
- [01-03]: statechange handler is intentional no-op — auto-resuming on interruption is anti-pattern on iOS Safari; resume() only inside user gesture
- [01-04]: transitionTile() mutates AppState in place — simpler than immutable for fixed 9-slot array
- [01-04]: Error retry (no-record) immediately calls handleTileTap(index) on same tap — no second tap required
- [01-04]: Defective blob error (has-record tile) is no-op in Phase 1 — Phase 2 long-press adds re-record
- [01-04]: HTTPS required for getUserMedia on iOS — @vitejs/plugin-basic-ssl enables self-signed cert; must be accepted once in Safari before testing
- [Phase 01-audio-and-storage-pipeline]: HTTPS required for iOS getUserMedia: @vitejs/plugin-basic-ssl added; self-signed cert accepted once in Safari
- [02-01]: touchend must NOT be passive — needs preventDefault() to suppress iOS synthetic click after long-press fires
- [02-01]: navigator.vibrate optional chaining compiles cleanly against DOM lib — no type cast needed
- [02-01]: label field optional with undefined semantics — avoids any IndexedDB migration for existing records
- [02-02]: Duration display deferred — durationSeconds not yet in SlotRecord schema; has-sound tiles show label only
- [02-02]: escapeHtml() in tile.ts prevents XSS from user-supplied tile labels
- [02-02]: grid.ts wires attachLongPress internally — main.ts supplies callbacks only, no second element iteration needed
- [02-02]: Dialogs as direct body children outside #app — avoids inheriting user-select: none from tile CSS
- [02-02]: Action sheet uses transform: translateY(100%) hidden state — avoids display:none transition pitfall
- [02-03]: Clone-before-wire pattern for action sheet buttons — cloneNode(true) before addEventListener eliminates stale listener accumulation on repeated showModal()
- [02-03]: requestAnimationFrame focus delay in rename dialog — iOS Safari keyboard won't appear if input.focus() fires synchronously during showModal()
- [02-03]: triggerHaptic() before any await in handleTileTap — iOS user-gesture context lost after first await; haptic must fire synchronously
- [02-03]: formatTimerDisplay inline in main.ts — timer display has different semantics from tile.ts formatDuration; kept local to avoid cross-concern import
- [02-04]: All 9 iPhone Safari test cases passed in single verification pass — Phase 2 feature-complete with no inline fixes required
- [02-04]: ngrok tunnel confirmed as correct HTTPS testing method for this project — avoids certificate warnings from self-signed certs
- [03-01]: registerType autoUpdate chosen — silent background updates via Workbox skipWaiting/clientsClaim, no user prompt
- [03-01]: navigateFallback set to offline.html not /index.html — uncached navigations get branded offline page, not broken app shell
- [03-01]: ImageMagick used for SVG-to-PNG conversion — @vite-pwa/assets-generator CLI failed silently; ImageMagick available via Homebrew
- [03-01]: theme_color #1a1a2e (dark navy), background_color #ff6b35 (orange) — navy matches app UI, orange matches icon background for splash
- [03-02]: triggerInstallBannerOnce() placed after triggerHaptic() but before any await — preserves iOS user gesture context while satisfying first-interaction requirement
- [03-02]: releaseWakeLock() called in both onComplete and manual-stop recording case — ensures wake lock is released regardless of how recording ends
- [03-02]: void operator used for fire-and-forget async wake lock calls — satisfies TypeScript no-floating-promises without blocking recording flow
- [03-03]: All four iPhone verification tests passed in single pass — standalone install, offline cache, install banner, and wake lock all confirmed on real iPhone Safari
- [03-03]: ngrok to production build (npm run build && npx serve dist) is required for offline/service-worker testing — dev server does not activate service worker

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 03-03-PLAN.md — iPhone Safari verification; all PWA requirements confirmed; project complete
Resume file: None
