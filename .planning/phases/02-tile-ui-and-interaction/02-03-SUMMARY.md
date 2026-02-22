---
phase: 02-tile-ui-and-interaction
plan: "03"
subsystem: ui
tags: [typescript, vite, dialog, indexeddb, web-audio, pwa, ios-safari]

# Dependency graph
requires:
  - phase: 02-01
    provides: label field on TileData, long-press primitive, triggerHaptic()
  - phase: 02-02
    provides: index.html dialogs, style.css, tile.ts, grid.ts, initGrid/updateTile/updateAllTiles
  - phase: 01-audio-and-storage-pipeline
    provides: recorder.ts, player.ts, db.ts, store.ts
provides:
  - showActionSheet(index, label, durationSeconds, callbacks) — iOS-style bottom action sheet
  - showRenameDialog(currentName) — Promise-based rename dialog with iOS keyboard timing fix
  - durationSeconds field on SlotRecord (backward-compatible)
  - Duration timestamp rendered on filled tile face via tile-duration class
  - Full Phase 2 main.ts — complete interactive soundboard app with all user flows
affects:
  - 02-04-PLAN (iPhone Safari verification uses this app)
  - Phase 3 (settings, icons, PWA manifest will build on this UI)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Clone-before-wire: replace dialog buttons with cloneNode(true) before wiring click handlers to eliminate stale listener accumulation across repeated showModal() calls
    - requestAnimationFrame focus delay: defer input.focus() via rAF for iOS Safari keyboard to appear after showModal()
    - triggerHaptic-before-await: haptic feedback called synchronously as first line in tap handler, before any await, to preserve iOS user-gesture context
    - updateTile-not-updateAllTiles: call updateTile(index, tile) per state transition instead of updateAllTiles() to avoid unnecessary DOM churn

key-files:
  created:
    - src/ui/action-sheet.ts
    - src/ui/rename-dialog.ts
  modified:
    - src/storage/db.ts
    - src/ui/tile.ts
    - src/main.ts

key-decisions:
  - "formatTimerDisplay inline in main.ts (not imported from tile.ts) — timer uses different format needs (count-up + count-down) than tile duration"
  - "stopRecordingTimer() called inside onComplete callback, not in 'recording' case of handleTileTap — ensures timer always stops exactly when recording data is assembled"
  - "handleRename() is a separate async function, not inline — clean error boundary and avoids nested async in showActionSheet callbacks"
  - "onReRecord calls handleTileTap(index) without re-calling triggerHaptic — the action sheet button tap itself is the user gesture; vibration from original long-press is sufficient"

patterns-established:
  - "Dialog button clone pattern: wireBtn(id, handler) replaces element with cloneNode before adding listener — prevents listener accumulation on repeated opens"
  - "Promise-based dialog API: showRenameDialog returns Promise<string|null>, caller awaits, clean cancel path returns null"
  - "initGrid + updateAllTiles on boot: initGrid creates tile elements; updateAllTiles syncs visual state after loadAllSlots restores records"

requirements-completed: [MGMT-01, MGMT-02, PLAY-03]

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 2 Plan 03: Action Sheet, Rename Dialog, and Full main.ts Wiring Summary

**iOS action sheet + Promise-based rename dialog wired into a complete Phase 2 main.ts: tile grid with recording timer, long-press management, delete/re-record/rename with IndexedDB persistence**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-22T09:04:23Z
- **Completed:** 2026-02-22T09:06:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `action-sheet.ts`: iOS-style bottom dialog using `<dialog id="action-sheet">`, clone-before-wire button pattern, backdrop-click-to-close, header shows label or "Kachel N · M:SS"
- Created `rename-dialog.ts`: Promise-based rename using `<dialog id="rename-dialog">`, requestAnimationFrame focus delay for iOS Safari keyboard, resolves to string or null on cancel
- Rewrote `main.ts` as full Phase 2 entry point: recording timer (count-up + count-down), triggerHaptic before any await, per-tile updateTile() calls, long-press action sheet wiring, delete/re-record/rename/persist flows
- Added `durationSeconds?: number` to `SlotRecord` (backward-compatible) and rendered duration timestamp on filled tile face

## Task Commits

1. **Task 1: Create action-sheet.ts and rename-dialog.ts** - `77719fa` (feat)
2. **Task 2: Add durationSeconds to SlotRecord and rewrite main.ts** - `f5a5a59` (feat)

**Plan metadata:** _(see final commit below)_

## Files Created/Modified

- `/Users/rotmanov/git/private/soundboard/src/ui/action-sheet.ts` - showActionSheet(): iOS-style bottom sheet with clone-button wiring and backdrop-click close
- `/Users/rotmanov/git/private/soundboard/src/ui/rename-dialog.ts` - showRenameDialog(): Promise<string|null> rename dialog with rAF focus delay
- `/Users/rotmanov/git/private/soundboard/src/storage/db.ts` - Added durationSeconds?: number to SlotRecord
- `/Users/rotmanov/git/private/soundboard/src/ui/tile.ts` - has-sound case now renders tile-duration span when durationSeconds present
- `/Users/rotmanov/git/private/soundboard/src/main.ts` - Full Phase 2 rewrite: initGrid, recording timer, handleTileTap, handleLongPress, handleRename, DOMContentLoaded bootstrap

## Decisions Made

- `formatTimerDisplay` defined inline in main.ts rather than importing from tile.ts — the timer display has different semantics (elapsed + remaining), keeping it local avoids a cross-concern import
- `stopRecordingTimer()` called inside the `onComplete` callback rather than in the `'recording'` switch case — ensures the timer interval is cleared exactly when recording data is assembled, even if auto-stop fires at 30s
- `handleRename()` extracted as a separate async function rather than inline inside the action sheet callback — provides a clean error boundary and avoids nested async/promise chains

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong import source for formatDuration**
- **Found during:** Task 2 (main.ts rewrite)
- **Issue:** Plan's execution context implied importing `formatDuration` from `./audio/format`, but that module only exports `detectSupportedMimeType` and `RECORDING_MIME_TYPE`; `formatDuration` lives in `./ui/tile.ts`
- **Fix:** Removed the incorrect import; the timer display function was implemented inline as `formatTimerDisplay()` as already planned in the recording timer section
- **Files modified:** src/main.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** f5a5a59 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — wrong import, fixed inline)
**Impact on plan:** Zero scope change. Import source correction only; all planned behavior identical.

## Issues Encountered

None beyond the import correction above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 2 Plan 03 complete: all interactive flows built and compile/build verified
- Plan 04 (iPhone Safari verification) can proceed immediately — `npm run dev -- --host` + ngrok for device testing
- All Phase 2 requirements satisfied: GRID-01, GRID-02, REC-03 (from 02-02), MGMT-01, MGMT-02, PLAY-03 (this plan)
- No blockers

---
*Phase: 02-tile-ui-and-interaction*
*Completed: 2026-02-22*
