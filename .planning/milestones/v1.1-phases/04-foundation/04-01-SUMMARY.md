---
phase: 04-foundation
plan: 01
subsystem: ui
tags: [typescript, indexeddb, tile-rendering, idb-keyval]

# Dependency graph
requires: []
provides:
  - SlotRecord.color optional field (src/storage/db.ts)
  - TileData.color optional field (src/state/store.ts)
  - Color preservation in transitionTile has-sound/playing branches
  - Duration badge in playing tile state (buildTileContent)
  - Bootstrap color restore from IndexedDB (main.ts)
affects:
  - 04-02 (confirm-dialog plan reads TileData, touches tile.ts)
  - 04-03 (color-picker plan writes SlotRecord.color, reads TileData.color, uses transitionTile color)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional field backward compat: color?: string with undefined = index-based default fallback"
    - "transitionTile data.color ?? tile.color — mirrors existing label forwarding pattern"
    - "Bootstrap color restore: pass color: record.color (undefined safe for v1.0 records)"

key-files:
  created: []
  modified:
    - src/storage/db.ts
    - src/state/store.ts
    - src/ui/tile.ts
    - src/main.ts

key-decisions:
  - "color?: string is optional on both SlotRecord and TileData — no migration needed; old v1.0 records load cleanly with undefined color"
  - "Duration badge added to playing branch by mirroring has-sound branch pattern — tile.record is always set in playing state"

patterns-established:
  - "Pattern: new per-slot datum added as optional field; every reader uses nullish coalescing fallback"
  - "Pattern: transitionTile forwards all persistent user preferences (label, color) in has-sound/playing branches"

requirements-completed: [UX-02]

# Metrics
duration: 1min
completed: 2026-02-23
---

# Phase 4 Plan 01: Schema Foundation + Playing Duration Badge Summary

**Optional color?: string added to SlotRecord and TileData; duration badge rendered in playing tile state to fix UX-02 gap**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-23T10:06:08Z
- **Completed:** 2026-02-23T10:07:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended SlotRecord interface with `color?: string` (backward-compatible optional field) — prerequisite for all Phase 4 color features
- Extended TileData interface with `color?: string` and added color preservation in `transitionTile` has-sound/playing branches
- Fixed UX-02 gap: playing tile state now renders the duration badge (matching has-sound behavior)
- Bootstrap handler passes `color: record.color` so stored colors survive app restart

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend SlotRecord and TileData with optional color field; preserve color in transitionTile** - `349af67` (feat)
2. **Task 2: Add duration badge to playing tile state in buildTileContent** - `c5151b0` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/storage/db.ts` - Added `color?: string` to SlotRecord interface
- `src/state/store.ts` - Added `color?: string` to TileData interface; added `next.color = data.color ?? tile.color` in transitionTile
- `src/ui/tile.ts` - Added duration badge rendering in `case 'playing':` branch of buildTileContent
- `src/main.ts` - Bootstrap loadAllSlots now passes `color: record.color` to transitionTile

## Decisions Made
- `color?: string` is optional on both interfaces — no IndexedDB migration needed; v1.0 records simply have `color: undefined` which falls back to index-based default via nullish coalescing at every read site
- Duration badge in playing branch mirrors has-sound branch exactly — `tile.record` is always set in playing state so no guard needed beyond the existing `?.durationSeconds != null` check

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Schema foundation complete: SlotRecord.color and TileData.color exist and are wired through transitionTile
- All subsequent Phase 4 plans (confirm-dialog, color-picker) can read and write color without schema changes
- No blockers for Phase 4 Plan 02

---
*Phase: 04-foundation*
*Completed: 2026-02-23*

## Self-Check: PASSED

- FOUND: src/storage/db.ts
- FOUND: src/state/store.ts
- FOUND: src/ui/tile.ts
- FOUND: src/main.ts
- FOUND: .planning/phases/04-foundation/04-01-SUMMARY.md
- FOUND commit: 349af67 (Task 1)
- FOUND commit: c5151b0 (Task 2)
