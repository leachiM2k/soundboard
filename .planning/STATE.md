# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23 after v1.1 milestone)

**Core value:** Ein Knopf drücken, ein Sound ertönt — sofort, zuverlässig, ohne Umwege.
**Current focus:** Planning next milestone (v1.2)

## Current Position

Milestone: v1.1 — UX-Polish + Neue Fähigkeiten — ✅ SHIPPED 2026-02-23
Phase: 6 of 6 (Audio Operations) — COMPLETE
Plan: 3 of 3 in current phase — COMPLETE
Status: v1.1 archived — all 7 requirements verified on real iPhone Safari; planning next milestone
Last activity: 2026-02-23 — v1.1 milestone complete, archived to .planning/milestones/

Progress: [██████████] 100% (v1.1, 9 of 9 plans)

## Performance Metrics

**Velocity (v1.0 reference):**
- Total plans completed: 11
- Average duration: ~15 min/plan
- Total execution time: ~2.5 hours

**v1.1 metrics:**
| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 04-foundation | 01 | ~15min | 3 | 6 |
| 04-foundation | 02 | 1min | 2 | 4 |
| 04-foundation | 03 | 2min | 2 | 5 |
| 05-visual-feedback | 01 | 2min | 2 | 3 |
| 05-visual-feedback | 02 | ~30min | 3 | 4 |
| 06-audio-operations | 01 | ~1min | 2 | 3 |
| 06-audio-operations | 02 | 2min | 3 | 5 |
| 06-audio-operations | 03 | ~30min | 3 | 3 |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
All v1.0 decisions carried forward.

**v1.1 key constraints from research:**
- Phase 4: AnalyserNode must connect to shared AudioContext singleton (iOS 4-context limit)
- Phase 5: Cap RAF at 30fps; cancel RAF + disconnect nodes in ALL stop paths (manual, auto-stop, error)
- Phase 6: Pre-load blob before user gesture; call `navigator.share()` synchronously (no await before it)
- Phase 6: Call `clearAudioCache(index)` immediately after every `saveSlot` that replaces a blob

**Phase 4 Plan 01 decisions:**
- color?: string is optional on SlotRecord and TileData — no migration needed; v1.0 records load cleanly with undefined color
- Duration badge in playing branch mirrors has-sound branch — tile.record always set in playing state
- [Phase 04-foundation]: UX-01 delete guard placed in action-sheet.ts wireBtn handler (not main.ts) — single responsibility, no double-guard
- [Phase 04-foundation]: confirm-dialog uses clone-before-wire pattern (same as action-sheet); safety-net close listener resolves false for ESC/backdrop
- [Phase 04-foundation]: Tasks 1 and 2 committed together: action-sheet.ts onColorChange interface change made main.ts fail TS2345 immediately
- [Phase 04-foundation]: handleColorChange does not call clearAudioCache — color is metadata only, blob is unchanged

**Phase 5 Plan 01 decisions:**
- [Phase 05-visual-feedback]: fillRect used exclusively — no roundRect (iOS 14.3+ target, roundRect unavailable on iOS 14.x)
- [Phase 05-visual-feedback]: AnalyserNode NOT connected to ctx.destination — prevents mic-to-speaker feedback on iOS
- [Phase 05-visual-feedback]: getByteFrequencyData used (not getFloatTimeDomainData — missing on Safari)
- [Phase 05-visual-feedback]: stopRecordingViz called in both recording case (Path 3) and onComplete (Path 2) — second call is idempotent no-op; eliminates race window
- [Phase 05-visual-feedback]: Canvas drawing buffer set from getBoundingClientRect() integers — avoids default 300x150 misalignment

**Phase 5 Plan 02 decisions:**
- [Phase 05-visual-feedback]: AudioContext.currentTime drives elapsed fraction (not Date.now) — synchronized to audio hardware, prevents drift
- [Phase 05-visual-feedback]: rAF loop capped at 30fps with TARGET_INTERVAL_MS guard — no battery drain from 60fps redraws on mobile
- [Phase 05-visual-feedback]: onStarted called after source.start(0) — most accurate startCtxTime capture
- [Phase 05-visual-feedback]: playBlob onStarted parameter is optional (4th arg) — backward-compatible, 3-argument callers unchanged
- [Phase 05-visual-feedback]: startRecordingViz must be called after updateTile — updateTile replaces innerHTML and would remove the canvas (bug fix a6600a6)

**Phase 6 Plan 01 decisions:**
- [Phase 06-audio-operations]: trimStartSec? and trimEndSec? are optional on SlotRecord — pre-Phase-6 records load with undefined fields, no migration needed (same pattern as color? in Phase 4)
- [Phase 06-audio-operations]: onTrim? and onExport? are optional on ActionSheetCallbacks — existing callers in main.ts compile unchanged until Plans 02/03 wire the handlers
- [Phase 06-audio-operations]: btn-trim and btn-export wired with callbacks.onTrim?.() optional chaining — tapping closes the sheet as a no-op until Plan 02/03

**Phase 6 Plan 02 decisions:**
- [Phase 06-audio-operations]: showTrimToast accepts nullable onUndo — null omits Undo button (used for 'Kein Ton gefunden' case); simpler than a separate showInfoToast function
- [Phase 06-audio-operations]: audioBufferCache exported from player.ts so handleTrim in main.ts can access it directly without re-decode
- [Phase 06-audio-operations]: handleTrim decodes AudioBuffer on-demand if cache miss — prevents 'no buffer' error on first-play-trim
- [Phase 06-audio-operations]: Auto-trim uses .catch(console.error) pattern — failure is non-fatal, tile remains fully usable

**Phase 6 Plan 03 decisions:**
- [Phase 06-audio-operations]: exportClip is synchronous (not async) — preserves iOS transient activation; blob pre-loaded in tile.record, no IndexedDB read before navigator.share()
- [Phase 06-audio-operations]: navigator.canShare?.() uses optional chaining — handles iOS < 15 where canShare method does not exist (avoids TypeError)
- [Phase 06-audio-operations]: triggerDownload is internal (non-exported) — only reachable from share.ts, keeps module surface clean
- [Phase 06-audio-operations]: isStandaloneMode() exported separately — allows callers to check standalone status independently if needed

**Phase 6 Plan 03 post-checkpoint decisions:**
- [Phase 06-audio-operations]: format.ts reordered to prefer audio/mp4 over audio/webm — iOS 16+ Safari added webm support to MediaRecorder; without reordering, new iOS 16+ recordings would be webm (incompatible with WhatsApp and native players); mp4 (AAC/M4A) is universally compatible

### Pending Todos

None.

### Blockers/Concerns

None — v1.1 milestone complete. All requirements verified on device.

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 06-03-PLAN.md — Phase 6 and v1.1 milestone complete
Resume with: N/A — v1.1 milestone fully shipped
