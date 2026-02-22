---
phase: 01-audio-and-storage-pipeline
plan: "03"
subsystem: audio
tags: [web-audio-api, audiocontext, audiobuffersourcenode, ios-safari, pwa]

# Dependency graph
requires:
  - phase: 01-01
    provides: project scaffold, db.ts storage layer, format.ts MIME detection
provides:
  - AudioContext singleton (lazy init, Safari-safe, one instance per app lifetime)
  - ensureAudioContextRunning() — must-call guard for every tap handler
  - playBlob(tileIndex, blob, onEnded) — per-tile playback with AudioBuffer cache
  - stopTile(tileIndex) — stops one tile, preserves parallel playback on others
  - clearAudioCache(tileIndex) — invalidates stale AudioBuffer on recording delete/replace
affects:
  - 01-04 (state machine wires player into tile tap handlers)
  - UI phase (all tap handlers must call ensureAudioContextRunning before audio ops)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AudioContext singleton: lazy init inside getAudioContext(), never at module load"
    - "Per-tap resume: ensureAudioContextRunning() called at start of every user gesture handler"
    - "Single-use source nodes: new AudioBufferSourceNode per playback, reuse AudioBuffer"
    - "Per-tile node tracking: activeNodes Map<number, AudioBufferSourceNode>"
    - "Per-tile buffer cache: audioBufferCache Map<number, AudioBuffer>"
    - "onEnded guard: fires callback only if node is still the active one (not replaced by re-tap)"

key-files:
  created:
    - src/audio/player.ts
  modified: []

key-decisions:
  - "AudioBuffer cached per tile after first decode — balances startup speed and repeat-play latency"
  - "decodeAudioData failure propagates to caller — defective blobs NOT deleted from storage"
  - "stopTile() only stops the specified tile — parallel playback across different tiles preserved"
  - "Auto-resume anti-pattern avoided — statechange handler intentional no-op, resume() only inside user gesture"

patterns-established:
  - "Tap handler pattern: await ensureAudioContextRunning() → await playBlob() — order is mandatory"
  - "Cache invalidation: call clearAudioCache(tileIndex) whenever a tile's blob changes"

requirements-completed: [PLAY-01, PLAY-02]

# Metrics
duration: 1min
completed: 2026-02-22
---

# Phase 01 Plan 03: Audio Player Module Summary

**Web Audio API player module with lazy AudioContext singleton, per-tile AudioBuffer caching, and iOS Safari user-gesture enforcement for parallel-capable soundboard playback**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-22T18:16:10Z
- **Completed:** 2026-02-22T18:17:09Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Lazy-initialized AudioContext singleton: created on first `getAudioContext()` call, never at module load (prevents Safari from suspending the context before a user gesture)
- `ensureAudioContextRunning()` guard function: resumes the AudioContext inside every tap handler, recovering from suspended/interrupted states (phone calls, backgrounding) without auto-resume anti-pattern
- `playBlob()` with per-tile AudioBuffer caching: decodes on first play, reuses decoded buffer on subsequent plays; PLAY-02 re-tap stops-and-restarts via `stopTile()` before new start; parallel playback across tiles preserved
- `stopTile()` and `clearAudioCache()`: clean per-tile state management for node lifecycle and cache invalidation

## Task Commits

Each task was committed atomically:

1. **Task 1: Player module with AudioContext singleton and per-tile playback** - `f4658c1` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/audio/player.ts` — AudioContext singleton, `getAudioContext`, `ensureAudioContextRunning`, `playBlob`, `stopTile`, `clearAudioCache`; no external imports, strict TypeScript, no `any` types

## Exported API

| Symbol | Signature | Purpose |
|---|---|---|
| `getAudioContext` | `() => AudioContext` | Returns the singleton, creating it lazily on first call |
| `ensureAudioContextRunning` | `() => Promise<void>` | Resumes suspended/interrupted context — call at start of every tap handler |
| `playBlob` | `(tileIndex: number, blob: Blob, onEnded: () => void) => Promise<void>` | Decode (or reuse cached AudioBuffer) and play; stops same tile first; throws on decode failure |
| `stopTile` | `(tileIndex: number) => void` | Stops active node for specified tile only; safe to call when not playing |
| `clearAudioCache` | `(tileIndex: number) => void` | Evicts cached AudioBuffer for a tile (call on delete/replace) |

## Internal State

| Map | Key | Value | Lifecycle |
|---|---|---|---|
| `activeNodes` | tile index | `AudioBufferSourceNode` | Set on `playBlob`, deleted on `stopTile` or natural completion |
| `audioBufferCache` | tile index | `AudioBuffer` | Set after first decode, deleted by `clearAudioCache` |

## AudioContext Lifecycle

1. `audioContext` module-level variable starts as `null`
2. First call to `getAudioContext()` creates `new AudioContext()` and attaches a `statechange` listener (intentional no-op — auto-resume on interruption is an anti-pattern on iOS Safari)
3. Every user tap handler calls `ensureAudioContextRunning()` first — this calls `ctx.resume()` if state is not `'running'`, handling initial suspension and post-interruption recovery in one place
4. The singleton is never replaced or recreated — ensures Safari's 4-instance limit is never approached

## Decisions Made

- AudioBuffer cached per tile after first decode — startup speed preserved (no pre-loading), repeat-play latency eliminated after first tap
- `decodeAudioData` failure propagates to caller — defective blobs remain in storage (user sees error, does not lose the recording)
- `statechange` handler is an intentional no-op — auto-resuming on interruption bypasses iOS Safari's user-gesture enforcement requirement
- Promise form of `decodeAudioData` used (not legacy callback form) — cleaner async flow, avoids Safari-specific callback bugs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/audio/player.ts` is complete and compiles cleanly under strict TypeScript
- Plan 04 (state machine) can now wire `ensureAudioContextRunning()` and `playBlob()` into tile tap handlers
- UI phase tap handlers must always call `ensureAudioContextRunning()` before any audio operation — this is a hard requirement for iOS Safari

---
*Phase: 01-audio-and-storage-pipeline*
*Completed: 2026-02-22*
