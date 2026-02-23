---
phase: 05-visual-feedback
plan: 01
subsystem: ui
tags: [web-audio, analyser-node, canvas, requestAnimationFrame, ios-safari, visualizer]

# Dependency graph
requires:
  - phase: 04-foundation
    provides: shared AudioContext singleton via getAudioContext() in audio/player.ts
provides:
  - startRecordingViz(index, stream) — starts 12-bar frequency visualizer canvas overlay on tile
  - stopRecordingViz(index) — stops rAF loop, disconnects nodes, removes canvas
  - .tile-viz-canvas CSS rule for absolute overlay positioning
affects: [05-visual-feedback plans that extend recording UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - AnalyserNode frequency bar visualizer using getByteFrequencyData (Safari-safe)
    - Module-level Map<number, {stop}> for lifecycle management of per-tile canvas viz
    - 30fps rAF cap via timestamp delta guard (TARGET_INTERVAL_MS = 1000/30)
    - Canvas drawing buffer sized from getBoundingClientRect() to avoid 300x150 default

key-files:
  created:
    - src/ui/viz-recording.ts
  modified:
    - src/style.css
    - src/main.ts

key-decisions:
  - "fillRect used exclusively — no roundRect (iOS 14.3+ target, roundRect unavailable on iOS 14.x)"
  - "AnalyserNode NOT connected to ctx.destination — prevents mic-to-speaker feedback on iOS"
  - "getByteFrequencyData used (not getFloatTimeDomainData — missing on Safari)"
  - "stopRecordingViz called in both recording case (Path 3) and onComplete (Path 2) — second call is idempotent no-op"
  - "Canvas drawing buffer set from getBoundingClientRect() integers — avoids default 300x150 misalignment"

patterns-established:
  - "Per-tile viz lifecycle via Map<number, {stop}> — same idempotent stop-before-start pattern as activeVizMap"
  - "startRecordingViz placed after startRecording() returns — stream already in scope"

requirements-completed: [VIZ-01]

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 5 Plan 01: Visual Feedback — Recording Visualizer Summary

**Real-time 12-bar frequency visualizer on recording tiles using AnalyserNode + canvas rAF loop, iOS 14-safe (fillRect, getByteFrequencyData), no speaker feedback**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-23T10:54:10Z
- **Completed:** 2026-02-23T10:55:43Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `src/ui/viz-recording.ts` with clean `startRecordingViz` / `stopRecordingViz` API
- Wired viz into all 3 recording paths in `main.ts` (start on empty->recording, stop on manual tap + onComplete)
- Added `.tile-viz-canvas` CSS absolute overlay rule to `src/style.css`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create viz-recording.ts — AnalyserNode frequency bar module** - `dd7d38f` (feat)
2. **Task 2: Add CSS overlay rule + wire viz into main.ts recording paths** - `b54ac66` (feat)

## Integration Points in main.ts

| Path | Line | Call | Trigger |
|------|------|------|---------|
| Import | 11 | `import { startRecordingViz, stopRecordingViz }` | Module import |
| Path 1 (start) | 138 | `startRecordingViz(index, stream)` | empty case — after `startRecording()` returns |
| Path 2 (stop) | 95 | `stopRecordingViz(index)` | `onComplete` callback — covers auto-stop (30s) and manual |
| Path 3 (stop) | 150 | `stopRecordingViz(index)` | `recording` case — synchronous manual stop before `.stop()` |

## Files Created/Modified
- `src/ui/viz-recording.ts` — AnalyserNode + canvas rAF loop, startRecordingViz / stopRecordingViz exports
- `src/style.css` — Added `.tile-viz-canvas` rule (position absolute, inset 0, pointer-events none)
- `src/main.ts` — Import + 3 integration call sites (1 start, 2 stops)

## iOS 14 Safety Confirmations
- **fillRect confirmed** — `canvasCtx!.fillRect(x, y, barW, barH)` used exclusively. No `roundRect` calls anywhere in `viz-recording.ts`.
- **No ctx.destination connection** — `source.connect(analyser)` only. `analyser.connect(ctx.destination)` is absent — mic audio never routed to iOS speakers.
- **getByteFrequencyData** used (not `getFloatTimeDomainData` which is absent on Safari).

## Decisions Made
- `fillRect` instead of `roundRect` — iOS 14.3 target does not have `roundRect`; `fillRect` works everywhere
- `getByteFrequencyData` instead of `getFloatTimeDomainData` — Safari's WebKit omits `getFloatTimeDomainData`; `getByteFrequencyData` is universally available
- No connection to `ctx.destination` — mic-to-speaker feedback on iOS is prevented by design
- Both Path 2 (onComplete) and Path 3 (recording case) call `stopRecordingViz` — second call is no-op due to `activeVizMap.delete` on first call; this eliminates any race window between manual stop and `onstop` event

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- VIZ-01 complete — recording tiles now show live audio feedback
- Ready for Phase 5 Plan 02 (if exists) or Phase 6 (Export)
- Real-device iPhone testing recommended to verify AnalyserNode feeds non-zero data on iOS 14.x

---
*Phase: 05-visual-feedback*
*Completed: 2026-02-23*
