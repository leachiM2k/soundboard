---
phase: 01-audio-and-storage-pipeline
plan: "02"
subsystem: audio
tags: [mediarecorder, getusermedia, ios-safari, webapi]

# Dependency graph
requires:
  - phase: 01-audio-and-storage-pipeline
    plan: "01"
    provides: "RECORDING_MIME_TYPE constant from format.ts (MIME probe result)"
provides:
  - "getMicrophoneStream(): lazy, cached MediaStream acquisition with getUserMedia"
  - "startRecording(): MediaRecorder session with 25s warning + 30s auto-stop + state guards"
  - "RecordingResult and ActiveRecording interfaces"
affects:
  - "01-03 (audio player will need RecordingResult blob)"
  - "UI phase (recorder integration, error handling)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Singleton MediaStream cache to avoid WebKit re-permission bug #215884"
    - "recorder.state === 'recording' guard before MediaRecorder.stop() — prevents InvalidStateError"
    - "No audioBitsPerSecond in MediaRecorderOptions — iOS Safari may ignore it"
    - "getUserMedia called lazily on first recording tap, never at module load"
    - "RECORDING_MIME_TYPE imported from format.ts — no hardcoded MIME strings"

key-files:
  created:
    - "src/audio/recorder.ts — getMicrophoneStream() and startRecording() with all iOS guard conditions"
  modified: []

key-decisions:
  - "MediaRecorderInit renamed to MediaRecorderOptions — TypeScript DOM lib uses MediaRecorderOptions; MediaRecorderInit does not exist in TS 5.8.3"
  - "audioBitsPerSecond intentionally absent from MediaRecorderOptions — iOS Safari may ignore it; AAC default is acceptable for speech"
  - "recorder.start() called with no timeslice argument — chunked recording with short timeslices is unreliable on iOS Safari"
  - "warnTimer set to null (not undefined) when onWarning absent — allows null check before clearTimeout"

patterns-established:
  - "Guard pattern: always check recorder.state === 'recording' before calling recorder.stop() (applied in both manual stop path and auto-stop timer)"
  - "Lazy singleton: cachedStream checked for both non-null AND .active before reuse"
  - "Timer cancellation order: cancel timers FIRST, then stop recorder (prevents double-stop race)"

requirements-completed: [REC-01, REC-02, REC-04]

# Metrics
duration: ~1min
completed: 2026-02-22
---

# Phase 1 Plan 02: Recorder Module Summary

**Lazy cached MediaStream + MediaRecorder session management with 25s warning, 30s auto-stop, and iOS state guards**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-22T18:15:58Z
- **Completed:** 2026-02-22T18:17:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `getMicrophoneStream()` acquires microphone lazily on first recording tap, caches the stream as singleton to avoid WebKit bug #215884 (repeated getUserMedia prompts in standalone PWA mode)
- `startRecording()` creates a MediaRecorder per session using `RECORDING_MIME_TYPE` from format.ts, fires onWarning at 25s, auto-stops at 30s, and guards both stop paths with `recorder.state === 'recording'`
- `RecordingResult` and `ActiveRecording` interfaces exported for downstream consumers
- All iOS Safari pitfalls from research are handled: no hardcoded MIME, no audioBitsPerSecond, no timeslice on start(), no stop() without state check

## Task Commits

1. **Task 1: Recorder module with iOS-safe guard conditions** - `f3bb07f` (feat)

## Files Created/Modified

- `src/audio/recorder.ts` (117 lines) — Complete recording session management: lazy stream acquisition, cached MediaStream singleton, MediaRecorder lifecycle, 25s/30s timers, state guards

## Exported Symbols

| Symbol | Kind | Signature |
|---|---|---|
| `RecordingResult` | interface | `{ blob: Blob; mimeType: string }` |
| `ActiveRecording` | interface | `{ stop: () => void }` |
| `getMicrophoneStream` | async function | `() => Promise<MediaStream>` |
| `startRecording` | function | `(stream, onComplete, onWarning?) => ActiveRecording` |

## cachedStream Singleton Management

- Module-level `let cachedStream: MediaStream | null = null`
- `getMicrophoneStream()` returns the cached stream if `cachedStream && cachedStream.active`
- If stream is inactive (tracks ended), `cachedStream` is reset to `null` before calling `getUserMedia` again
- No code path calls `getUserMedia` at module load time — only on explicit `getMicrophoneStream()` call

## Timer Values

| Constant | Value | Purpose |
|---|---|---|
| `WARNING_MS` | `25_000` ms | Fires `onWarning` callback — caller shows visual indicator |
| `MAX_MS` | `30_000` ms | Auto-stops recorder; saves all chunks collected so far |

## Decisions Made

- `MediaRecorderOptions` used instead of `MediaRecorderInit` — the correct TypeScript DOM type; `MediaRecorderInit` does not exist in TypeScript 5.8.3 lib.dom.d.ts
- `audioBitsPerSecond` intentionally absent from options object — iOS Safari may ignore it; AAC default bitrate is well under 500 KB for 30s of mono speech
- `recorder.start()` called with no timeslice — chunked recording with short timeslices is unreliable on iOS Safari; single `ondataavailable` chunk at stop time is preferred

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect TypeScript type MediaRecorderInit -> MediaRecorderOptions**
- **Found during:** Task 1 (Recorder module with iOS-safe guard conditions)
- **Issue:** Plan code used `MediaRecorderInit` which does not exist in TypeScript 5.8.3 lib.dom.d.ts; compiler error TS2552 "Cannot find name 'MediaRecorderInit'"
- **Fix:** Changed type annotation to `MediaRecorderOptions` — the correct type for MediaRecorder constructor options
- **Files modified:** `src/audio/recorder.ts`
- **Verification:** `npm run build` exits 0 with zero TypeScript errors after fix
- **Committed in:** `f3bb07f` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug: wrong TypeScript type name)
**Impact on plan:** Necessary correctness fix; no functional or behavioral change. The options object shape is identical.

## Issues Encountered

Build failed on first attempt with TS2552 due to `MediaRecorderInit` not being defined in TypeScript's DOM lib. Fixed immediately by switching to `MediaRecorderOptions`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `getMicrophoneStream()` and `startRecording()` are ready for use in the audio player or UI integration
- `RecordingResult` blob will feed into Plan 03 (audio playback) and Plan 04 (storage)
- No blockers — recorder module is complete and compiles cleanly

---
*Phase: 01-audio-and-storage-pipeline*
*Completed: 2026-02-22*
