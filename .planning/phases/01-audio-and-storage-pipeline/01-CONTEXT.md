# Phase 1: Audio and Storage Pipeline - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the complete audio engine: record from microphone → encode → store in IndexedDB → retrieve → play via Web Audio API. This phase delivers the working audio pipeline with all iOS Safari constraints handled correctly. No visible tile UI — that's Phase 2. Phase 2 wires this engine to the 3×3 grid.

</domain>

<decisions>
## Implementation Decisions

### Recording Limits
- Maximum recording duration: **30 seconds**, auto-stop when reached
- Warning signal at **25 seconds** (5s before limit) — visual indicator to user
- When 30s limit is hit: **automatically save** everything recorded up to that point
- No minimum recording length — very short clips (< 1s) are saved as-is

### Microphone Permission & Errors
- Permission denied: show **inline hint** on screen (not a toast, not a modal) — e.g., "Mikrofon-Zugriff erforderlich"
- User can retry by **tapping the empty tile again** — re-triggers the getUserMedia permission request
- Recording failure (mic unavailable, system error): **tile stays empty + brief error message**
- Strategy: treat every recording attempt as independent; no auto-retry

### Audio Quality
- Priority: **speech intelligibility** (optimized for voice, not high-fidelity music)
- Target: **under 500 KB per clip** (achievable with 32–64 kbps AAC mono for 30s of speech)
- Use iOS-native AAC/MP4 via MediaRecorder; detect MIME type at startup with `isTypeSupported()`
- Store detected MIME type alongside blob in IndexedDB for correct playback

### Playback Behavior
- Sound plays to completion → tile returns to **"filled/idle" state** (no lingering active state)
- **Multiple sounds can play in parallel** — tapping tile 2 while tile 1 is playing does NOT stop tile 1
- Each tile manages its own AudioBufferSourceNode independently
- Defective/unplayable blob: show **error message + keep the sound** in storage (don't silently delete)

### Claude's Discretion
- Exact inline error message copy (German or English consistency)
- Specific warning animation style at 25s countdown
- AudioContext interrupted-state recovery logic (phone call, backgrounding)
- `navigator.storage.persist()` call timing (on first user interaction)
- idb-keyval schema: `{ blob: Blob, mimeType: string, recordedAt: number }`
- Pre-decoded AudioBuffer cache strategy (decode on load vs. decode on first play)

</decisions>

<specifics>
## Specific Ideas

- "Platzsparend" (space-efficient) was an explicit requirement from the user — 500KB/clip target reflects this
- Parallel playback was explicitly chosen over interrupt-on-tap — unusual for a soundboard, but this is the user's preference
- Inline error hint (not toast) for permission denied means it should remain visible until the user acts

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-audio-and-storage-pipeline*
*Context gathered: 2026-02-22*
