---
phase: 05-visual-feedback
plan: 02
subsystem: ui
tags: [svg, canvas, web-audio, animation, requestAnimationFrame, AudioContext]

# Dependency graph
requires:
  - phase: 05-01
    provides: viz-recording.ts module and recording visualizer pattern (startRecordingViz/stopRecordingViz)
  - phase: 04-foundation
    provides: player.ts playBlob function that this plan extends with onStarted callback
provides:
  - SVG progress ring animation during audio playback (UX-03)
  - viz-playback.ts module with startPlaybackProgress/stopPlaybackProgress
  - playBlob extended with optional onStarted callback (backward-compatible)
  - All 5 playback stop paths covered in main.ts (stopPlaybackProgress)
  - Both playback start paths covered in main.ts (startPlaybackProgress via onStarted)
affects: [06-export, any future plan modifying player.ts or main.ts playback paths]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SVG progress ring driven by AudioContext.currentTime (not Date.now) for hardware-synchronized elapsed tracking"
    - "rAF loop capped at 30fps via TARGET_INTERVAL_MS timestamp delta guard — prevents battery drain"
    - "activeProgressMap Map<number, { stop: () => void }> for idempotent start/stop lifecycle"
    - "onStarted optional callback pattern on playBlob — backward-compatible, mirrors existing onEnded pattern"
    - "stopPlaybackProgress called before every tile state transition that terminates playback"

key-files:
  created:
    - src/ui/viz-playback.ts
  modified:
    - src/audio/player.ts
    - src/style.css
    - src/main.ts

key-decisions:
  - "AudioContext.currentTime drives elapsed fraction — synchronized to audio hardware, not wall clock (Date.now would drift)"
  - "rAF loop capped at 30fps with TARGET_INTERVAL_MS guard — no battery drain from 60fps redraws on mobile"
  - "onStarted called immediately after source.start(0) in player.ts — most accurate startCtxTime capture"
  - "playBlob onStarted parameter is optional — 3-argument callers unchanged, no migration needed"
  - "startRecordingViz must be called after updateTile (post-checkpoint bug fix a6600a6) — updateTile replaces innerHTML and removes canvas"

patterns-established:
  - "Pattern: viz module exports start/stop pair with internal Map for active animation lifecycle"
  - "Pattern: SVG ring strokeDashoffset animation — CIRCUMFERENCE * (1 - fraction) drives fill from 0 to 100%"
  - "Pattern: stopX called before every tile state transition (onEnded, catch, re-tap) — clean teardown"

requirements-completed: [UX-03]

# Metrics
duration: ~30min (including device verification)
completed: 2026-02-23
---

# Phase 5 Plan 02: Visual Feedback — Playback Progress Ring Summary

**SVG progress ring fills clockwise during audio playback using AudioContext.currentTime clock, covering all 5 playback-stop paths in main.ts and verified working on iPhone Safari**

## Performance

- **Duration:** ~30 min (including real-device verification via ngrok)
- **Started:** 2026-02-23
- **Completed:** 2026-02-23
- **Tasks:** 3 (2 implementation + 1 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments

- Created `src/ui/viz-playback.ts` — standalone SVG ring module, rAF loop capped at 30fps, AudioContext.currentTime for elapsed tracking
- Extended `player.ts` `playBlob` with optional `onStarted(startCtxTime, durationSec)` callback called immediately after `source.start(0)`
- Wired all 5 `stopPlaybackProgress` call sites and both `startPlaybackProgress` call sites in `main.ts`
- Human verified on iPhone Safari: frequency bars (VIZ-01) and progress ring (UX-03) both confirmed working
- Post-checkpoint bug fix: `startRecordingViz` moved after `updateTile` to prevent canvas removal race

## Task Commits

Each task was committed atomically:

1. **Task 1: Create viz-playback.ts + extend player.ts with onStarted callback** - `5b7d172` (feat)
2. **Task 2: Add CSS ring rule + wire progress into main.ts all playback paths** - `6d3984f` (feat)
3. **Task 3: Human verification checkpoint — APPROVED** - checkpoint approved, no code commit
4. **Post-checkpoint bug fix: startRecordingViz ordering** - `a6600a6` (fix)

## Files Created/Modified

- `src/ui/viz-playback.ts` — SVG ring rAF module: `startPlaybackProgress(index, startCtxTime, durationSec)` and `stopPlaybackProgress(index)`; activeProgressMap for lifecycle management
- `src/audio/player.ts` — `playBlob` extended with optional 4th parameter `onStarted?(startCtxTime, durationSec)`; called after `source.start(0)` for accurate timing
- `src/style.css` — `.tile-progress-ring` CSS rule: `position: absolute`, centered via `translate(-50%, -50%)`, `pointer-events: none`, `overflow: visible`
- `src/main.ts` — 5 `stopPlaybackProgress` call sites + 2 `startPlaybackProgress` call sites wired in

## stopPlaybackProgress call sites in main.ts (5 total)

1. `has-sound` case `onEnded` callback — before `transitionTile(appState, index, 'has-sound', { record })`
2. `has-sound` case `catch` block — before `transitionTile(appState, index, 'error', ...)`
3. `playing` case re-tap — before `stopTile(index)` (removes ring from interrupted playback)
4. `playing` case `onEnded` callback — before `transitionTile(appState, index, 'has-sound', { record })`
5. `playing` case `catch` block — before `transitionTile(appState, index, 'error', ...)`

## startPlaybackProgress call sites in main.ts (2 total, via onStarted)

1. `has-sound` case — 4th argument to `playBlob`: `(startCtxTime, durationSec) => startPlaybackProgress(index, startCtxTime, durationSec)`
2. `playing` case — 4th argument to second `playBlob` call (restarted playback): same pattern

## Decisions Made

- **AudioContext.currentTime vs Date.now:** AudioContext.currentTime is synchronized to audio hardware; Date.now is wall clock and can drift relative to audio playback. Using ctx.currentTime ensures the ring matches the actual audio position exactly.
- **30fps rAF cap:** `TARGET_INTERVAL_MS = 1000 / 30` with timestamp delta guard prevents 60fps redraws on iPhone, reducing battery consumption for a purely cosmetic animation.
- **onStarted called after source.start(0):** Capturing `ctx.currentTime` immediately after `source.start(0)` gives the most accurate start reference. Calling it before would include buffer decode/scheduling overhead.
- **Optional onStarted parameter:** Matches the existing `onEnded` callback pattern. All pre-existing 3-argument callers of `playBlob` continue to work without changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed startRecordingViz called before updateTile**
- **Found during:** Post-checkpoint verification on device
- **Issue:** `startRecordingViz` appended a canvas to the tile, but the subsequent `updateTile` call replaced the tile's `innerHTML`, removing the canvas before any frames rendered. Recording visualization never appeared after the first tap in a session.
- **Fix:** Reordered calls in `main.ts` recording path — `updateTile` first, then `startRecordingViz`. The canvas is appended to the already-updated DOM and persists.
- **Files modified:** `src/main.ts`
- **Verification:** Recording frequency bars visible on iPhone Safari after fix
- **Committed in:** `a6600a6`

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for VIZ-01 to work at all after the first recording session. No scope creep.

## Issues Encountered

The post-checkpoint bug (canvas removed by innerHTML replacement) was not caught during Task 2 automated verification because TypeScript compilation passes regardless of DOM ordering. Only real-device testing exposed the issue since the race is timing-dependent and only triggers when the DOM update and canvas append happen in the same tick.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 complete: VIZ-01 (recording bars) and UX-03 (playback ring) both verified on iPhone Safari
- Blocker cleared: AnalyserNode data feed on iOS confirmed working
- Phase 6 (Export / Share) can proceed — no visual feedback dependencies remain
- Reminder for Phase 6: Web Share Level 2 file attachment must be verified on device; call `navigator.share()` synchronously (no await before it)

---
*Phase: 05-visual-feedback*
*Completed: 2026-02-23*
