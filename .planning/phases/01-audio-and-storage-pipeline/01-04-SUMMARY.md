---
phase: 01-audio-and-storage-pipeline
plan: "04"
subsystem: audio
tags: [state-machine, web-audio-api, mediarecorder, indexeddb, ios-safari, pwa, vite]

# Dependency graph
requires:
  - phase: 01-01
    provides: project scaffold, idb-keyval storage layer, format.ts MIME detection
  - phase: 01-02
    provides: getMicrophoneStream, startRecording, ActiveRecording, RecordingResult
  - phase: 01-03
    provides: ensureAudioContextRunning, playBlob, stopTile, clearAudioCache
provides:
  - 9-slot state machine (TileState, TileData, AppState, createAppState, transitionTile)
  - App bootstrap: loadAllSlots on DOMContentLoaded, tiles restored to has-sound
  - Tap handler: all 6 tile states handled with correct transition logic
  - Inline error display (not toast, not modal)
  - requestStoragePersistence() on first tap (STOR-03)
  - 25s warning + 30s auto-stop wired to UI
  - Parallel playback: multiple tiles play simultaneously
affects:
  - UI phase (Phase 2 replaces main.ts but must preserve tap handler patterns)
  - State machine types (Phase 2 imports TileState, TileData, AppState from store.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "State machine: mutate-in-place AppState, transitionTile() clears stale fields per target state"
    - "Tap handler order: requestStoragePersistence → ensureAudioContextRunning → dispatch by state"
    - "Inline error: tile button text content shows error message (no toast, no modal)"
    - "Defective blob: error state preserves record in TileData — blob NOT deleted from IndexedDB"
    - "Error retry: no-record error → back to empty → immediate retry on same tap"
    - "Saving no-op: tap while saving is silently ignored"

key-files:
  created:
    - src/state/store.ts
  modified:
    - src/main.ts
    - vite.config.ts
    - package.json

key-decisions:
  - "transitionTile() mutates AppState in place — simpler than immutable updates for 9-slot fixed-size array"
  - "Error retry is immediate on same tap — empty transition then handleTileTap(index) called recursively"
  - "Playing re-tap: stopTile() then playBlob() restart — PLAY-02 compliance"
  - "Defective blob error preserves record field in TileData — no deletion from IndexedDB"
  - "Playback error on has-record tile is no-op in Phase 1 — Phase 2 adds long-press re-record"

patterns-established:
  - "Tap pattern: requestStoragePersistence() → ensureAudioContextRunning() → switch(tile.state)"
  - "Render after every transition: renderTiles(appState) called immediately after transitionTile()"
  - "onComplete closure captures index — safe because index is fixed per tap handler invocation"
  - "Exhaustive switch: default case uses never type to catch missing states at compile time"

requirements-completed: [REC-01, REC-02, REC-04, STOR-01, STOR-02, STOR-03, PLAY-01, PLAY-02]

# Metrics
duration: ~10min
completed: 2026-02-22
---

# Phase 01 Plan 04: State Machine and App Harness Summary

**9-slot tile state machine (6 states, full transition graph) wired to MediaRecorder, Web Audio API, and IndexedDB into a functional test harness verified on desktop; iPhone Safari verification pending at checkpoint**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-22T18:20:06Z
- **Completed:** 2026-02-22T18:30:00Z (checkpoint — iPhone verification pending)
- **Tasks:** 2 of 3 (Task 3 awaits human iPhone verification)
- **Files modified:** 2

## Accomplishments

- State machine `src/state/store.ts`: `TileState` union (6 states), `TileData` interface with per-state typed fields, `AppState` container, `createAppState()` factory, `transitionTile()` with field-clearing logic and RangeError guard
- App bootstrap `src/main.ts`: `loadAllSlots()` on `DOMContentLoaded` restores all filled slots; `renderTiles()` redraws all 9 buttons after every transition
- Full tap handler dispatch for all 6 tile states: empty (record), recording (stop/save), has-sound (play), playing (restart), error (retry or no-op), saving (no-op)
- iOS-critical ordering enforced: `requestStoragePersistence()` → `ensureAudioContextRunning()` → dispatch — every tap, no exceptions
- Microphone permission lazy: `getMicrophoneStream()` called only in tap handler for `empty` state (REC-04)
- Inline error messages on button text — no toast, no modal (CONTEXT.md locked decision)
- 25s warning sets `warningActive=true` → button shows "(25s!)" indicator
- `npm run build` exits 0; `npm run dev` serves page; dev server network URL verified on local network

## Task Commits

Each task was committed atomically:

1. **Task 1: 9-slot state machine** - `0ae9bcc` (feat)
2. **Task 2: App bootstrap and tap handler harness** - `0ea6f3f` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/state/store.ts` — `TileState`, `TileData`, `AppState`, `createAppState`, `transitionTile`; strict TypeScript, no `any` types
- `src/main.ts` — Full app bootstrap with `loadAllSlots`, `renderTiles`, `handleTileTap` (all 6 state cases); imports from all 5 modules

## Exported API — src/state/store.ts

| Symbol | Signature | Purpose |
|---|---|---|
| `TileState` | `type` | Union of 6 tile lifecycle states |
| `TileData` | `interface` | Per-tile data: state + optional activeRecording, record, errorMessage, warningActive |
| `AppState` | `interface` | `tiles: TileData[]` — 9 elements |
| `createAppState` | `() => AppState` | Creates 9 empty tiles |
| `transitionTile` | `(appState, index, newState, data?) => TileData` | Mutate tile to new state, clearing stale fields |

## State Transition Graph

| From | To | Trigger |
|---|---|---|
| empty | recording | getUserMedia succeeds |
| empty | error | getUserMedia fails |
| recording | saving | manual stop or 30s auto-stop |
| saving | has-sound | saveSlot completes |
| saving | error | saveSlot fails |
| has-sound | playing | user tap |
| playing | has-sound | playback completes naturally |
| playing | playing | user re-tap (restart) |
| has-sound | error | decodeAudioData fails |
| error (no record) | empty | user tap → retry |
| error (has record) | — | no-op in Phase 1 |

## iPhone Safari Verification — Task 3 Results

**Status: RE-TEST REQUIRED — HTTPS fix applied; awaiting human re-verification**

First test attempt failed: tapping a tile showed "Slot 0: error Mikrofon nicht verfügbar". Root cause: iOS Safari enforces secure context for `getUserMedia`. Serving over `http://192.168.x.x:5173` (HTTP on a LAN IP) is not a secure context — Safari refuses microphone access with `NotAllowedError`.

Fix applied: installed `@vitejs/plugin-basic-ssl` and configured Vite to serve HTTPS with a self-signed certificate. The dev server URL is now `https://192.168.x.x:5173`. The user must accept the self-signed certificate warning in Safari once before testing.

See checkpoint message for 7-test protocol.

## Decisions Made

- `transitionTile()` mutates AppState in place — immutable 9-element array updates add complexity with no benefit for a fixed-size 9-slot board
- Error retry on no-record tile: transition to `empty` then immediately call `handleTileTap(index)` on the same tap — one tap = retry without requiring a second tap
- Defective blob error (has-record tile) is no-op in Phase 1 — Phase 2 long-press adds re-record; the error message stays visible
- `stopTile()` called before `playBlob()` on re-tap of playing tile — ensures PLAY-02 (restart from beginning) works correctly
- `onComplete` closure captures `index` by value — safe since index is fixed for the lifetime of the tap handler invocation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HTTPS required for getUserMedia on iOS Safari**

- **Found during:** Task 3 (iPhone Safari verification, first attempt)
- **Issue:** iOS Safari rejected `getUserMedia` with a NotAllowedError because the dev server was served over HTTP on a LAN IP (`http://192.168.x.x:5173`). iOS enforces a strict secure context requirement — only `localhost` or HTTPS origins are allowed.
- **Fix:** Installed `@vitejs/plugin-basic-ssl` (dev dep) and updated `vite.config.ts` with `basicSsl()` plugin + `server: { https: true }`. The dev server now serves HTTPS with a self-signed certificate.
- **Files modified:** `vite.config.ts`, `package.json`, `package-lock.json`
- **Commit:** `dabb595`

The `saveSlot` call in `onComplete` required constructing the `SlotRecord` inline; `recordedAt` uses `Date.now()` at save time (not recording start time) which matches the plan's intent.

## Issues Encountered

None during Tasks 1-2. TypeScript compiled cleanly on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/state/store.ts` and `src/main.ts` complete; build passing
- iPhone Safari verification (Task 3) required before Phase 1 is complete
- After iPhone verification passes, Phase 2 (UI) can begin
- Phase 2 will replace `src/main.ts` entirely but must import `TileState`, `TileData`, `AppState` from `src/state/store.ts`

---
*Phase: 01-audio-and-storage-pipeline*
*Completed: 2026-02-22 (pending iPhone checkpoint)*
