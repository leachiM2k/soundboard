# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Ein Knopf drücken, ein Sound ertönt — sofort, zuverlässig, ohne Umwege.
**Current focus:** Phase 1 — Audio and Storage Pipeline

## Current Position

Phase: 1 of 3 (Audio and Storage Pipeline) — COMPLETE
Plan: 4 of 4 in current phase (all plans complete)
Status: Phase 1 complete — ready for Phase 2 (UI)
Last activity: 2026-02-22 — Plan 01-04 complete; all 7 iPhone Safari tests passed and approved

Progress: [███░░░░░░░] 33% (Phase 1 of 3 done)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~4 minutes
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Audio and Storage Pipeline | 4/4 | ~27 min | ~7 min |

**Recent Trend:**
- Last 5 plans: 01-01 (~7 min), 01-02 (~1 min), 01-03 (~1 min), 01-04 (~15 min including iPhone verification)
- Trend: Stable; device verification adds real-world overhead

*Updated after each plan completion*
| Phase 01-audio-and-storage-pipeline P04 | 15 | 3 tasks | 4 files |

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

### Pending Todos

None.

### Blockers/Concerns

None. Phase 1 complete and verified on real device.

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 01-04-PLAN.md — Phase 1 fully done; ready for Phase 2 (UI)
Resume file: None
