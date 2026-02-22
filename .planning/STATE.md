# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Ein Knopf drücken, ein Sound ertönt — sofort, zuverlässig, ohne Umwege.
**Current focus:** Phase 1 — Audio and Storage Pipeline

## Current Position

Phase: 1 of 3 (Audio and Storage Pipeline)
Plan: 1 of 4 in current phase
Status: In progress
Last activity: 2026-02-22 — Completed 01-01: project scaffold + storage foundation

Progress: [█░░░░░░░░░] 8%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: ~7 minutes
- Total execution time: 0.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Audio and Storage Pipeline | 1/4 | ~7 min | ~7 min |

**Recent Trend:**
- Last 5 plans: 01-01 (~7 min)
- Trend: Baseline established

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

### Pending Todos

None.

### Blockers/Concerns

- Real device testing required for Phase 1 audio work — iOS Safari AudioContext user-gesture enforcement, MediaRecorder MIME types, and IndexedDB behavior differ significantly from desktop and simulator
- AudioContext must be unlocked on very first user tap — Safari silently fails with no error if this is skipped

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 01-01-PLAN.md — project scaffold, format.ts, db.ts committed
Resume file: None
