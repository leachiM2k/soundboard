# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Ein Knopf drücken, ein Sound ertönt — sofort, zuverlässig, ohne Umwege.
**Current focus:** Phase 1 — Audio and Storage Pipeline

## Current Position

Phase: 1 of 3 (Audio and Storage Pipeline)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-02-22 — Completed 01-03: audio player module (player.ts)

Progress: [███░░░░░░░] 25%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~4 minutes
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Audio and Storage Pipeline | 3/4 | ~12 min | ~4 min |

**Recent Trend:**
- Last 5 plans: 01-01 (~7 min), 01-02 (~1 min), 01-03 (~1 min)
- Trend: Decreasing as plans become more focused

*Updated after each plan completion*

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

### Pending Todos

None.

### Blockers/Concerns

- Real device testing required for Phase 1 audio work — iOS Safari AudioContext user-gesture enforcement, MediaRecorder MIME types, and IndexedDB behavior differ significantly from desktop and simulator
- AudioContext must be unlocked on very first user tap — Safari silently fails with no error if this is skipped

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 01-03-PLAN.md — player.ts with AudioContext singleton and per-tile playback committed
Resume file: None
