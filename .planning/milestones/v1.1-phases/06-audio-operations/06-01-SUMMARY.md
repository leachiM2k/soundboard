---
phase: 06-audio-operations
plan: 01
subsystem: ui, database
tags: [typescript, indexeddb, action-sheet, trim, export, idb-keyval]

# Dependency graph
requires:
  - phase: 04-foundation
    provides: SlotRecord interface with optional fields pattern (color?), action-sheet.ts clone-before-wire wiring pattern
  - phase: 05-visual-feedback
    provides: No direct dependency — foundation shared file state established here
provides:
  - SlotRecord with trimStartSec?: number and trimEndSec?: number optional fields
  - ActionSheetCallbacks with onTrim?: () => void and onExport?: () => void
  - btn-trim and btn-export wired in showActionSheet() via clone-before-wire pattern
  - HTML buttons in index.html #action-sheet dialog for Plans 02 and 03 to activate
affects: [06-02, 06-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Optional fields on SlotRecord load cleanly from pre-Phase-6 IndexedDB records (undefined, no migration)
    - Optional callbacks on ActionSheetCallbacks (?) allow incremental wiring across plans without breaking existing callers

key-files:
  created: []
  modified:
    - src/storage/db.ts
    - src/ui/action-sheet.ts
    - index.html

key-decisions:
  - "[Phase 06-audio-operations]: trimStartSec? and trimEndSec? are optional on SlotRecord — pre-Phase-6 records load with undefined fields, no migration needed (same pattern as color? in Phase 4)"
  - "[Phase 06-audio-operations]: onTrim? and onExport? are optional on ActionSheetCallbacks — existing callers in main.ts compile unchanged until Plans 02/03 wire the handlers"
  - "[Phase 06-audio-operations]: btn-trim and btn-export wired with callbacks.onTrim?.() optional chaining — tapping either button closes the sheet as a no-op until Plan 02/03"

patterns-established:
  - "Incremental interface extension: add optional callbacks to ActionSheetCallbacks so existing callers continue compiling while Plans 02/03 add implementations"

requirements-completed: [TRIM-01, SHARE-01]

# Metrics
duration: ~1min
completed: 2026-02-23
---

# Phase 6 Plan 01: Audio Operations Foundation Summary

**SlotRecord extended with optional trim fields and action sheet augmented with Trim + Export buttons wired via clone-before-wire pattern**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-23T12:39:30Z
- **Completed:** 2026-02-23T12:40:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `trimStartSec?: number` and `trimEndSec?: number` to `SlotRecord` — pre-Phase-6 IndexedDB records load cleanly with `undefined` (no migration)
- Extended `ActionSheetCallbacks` with optional `onTrim?` and `onExport?` — existing `main.ts` callers compile unchanged
- Added `btn-trim` ("Stille kürzen") and `btn-export` ("Exportieren") buttons to the action sheet in `index.html` and wired them via the clone-before-wire pattern in `showActionSheet()`
- Full build (`npm run build`) passes; TypeScript strict check clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend SlotRecord with trim offset fields** - `8a3de25` (feat)
2. **Task 2: Add Trim and Export buttons to action sheet HTML and TypeScript** - `5c88310` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/storage/db.ts` - Added `trimStartSec?` and `trimEndSec?` optional fields to `SlotRecord` interface
- `src/ui/action-sheet.ts` - Added `onTrim?`/`onExport?` to `ActionSheetCallbacks`; wired `btn-trim` and `btn-export` in `showActionSheet()`
- `index.html` - Added `<button id="btn-trim">Stille kürzen</button>` and `<button id="btn-export">Exportieren</button>` between `btn-rename` and `btn-delete`

## Decisions Made
- `trimStartSec?` and `trimEndSec?` are optional on `SlotRecord` — no migration needed; pre-Phase-6 records load with `undefined` (same pattern as `color?` in Phase 4)
- `onTrim?` and `onExport?` are optional on `ActionSheetCallbacks` — existing callers in `main.ts` compile unchanged until Plans 02/03 wire the handlers
- Tapping `btn-trim` or `btn-export` calls `callbacks.onTrim?.()` / `callbacks.onExport?.()` via optional chaining — sheet closes, no error, no-op until Plans 02/03

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

All files confirmed present, all commits verified, all interface fields confirmed in source.

## Next Phase Readiness
- Plan 02 (silence trim) can immediately implement `onTrim` in `main.ts` and the `trimStartSec`/`trimEndSec` fields are ready in `SlotRecord`
- Plan 03 (export/share) can immediately implement `onExport` in `main.ts`
- No shared-file conflicts between Plans 02 and 03 after this foundation

---
*Phase: 06-audio-operations*
*Completed: 2026-02-23*
