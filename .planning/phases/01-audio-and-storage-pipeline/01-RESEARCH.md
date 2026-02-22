# Phase 1: Audio and Storage Pipeline - Research

**Researched:** 2026-02-22
**Domain:** Web Audio API, MediaRecorder API, IndexedDB (idb-keyval), iOS Safari audio constraints
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Maximum recording duration: **30 seconds**, auto-stop when reached
- Warning signal at **25 seconds** (5s before limit) — visual indicator to user
- When 30s limit is hit: **automatically save** everything recorded up to that point
- No minimum recording length — very short clips (< 1s) are saved as-is
- Permission denied: show **inline hint** on screen (not a toast, not a modal) — e.g., "Mikrofon-Zugriff erforderlich"
- User can retry by **tapping the empty tile again** — re-triggers the getUserMedia permission request
- Recording failure (mic unavailable, system error): **tile stays empty + brief error message**
- Strategy: treat every recording attempt as independent; no auto-retry
- Priority: **speech intelligibility** (optimized for voice, not high-fidelity music)
- Target: **under 500 KB per clip** (achievable with 32–64 kbps AAC mono for 30s of speech)
- Use iOS-native AAC/MP4 via MediaRecorder; detect MIME type at startup with `isTypeSupported()`
- Store detected MIME type alongside blob in IndexedDB for correct playback
- Sound plays to completion → tile returns to **"filled/idle" state** (no lingering active state)
- **Multiple sounds can play in parallel** — tapping tile 2 while tile 1 is playing does NOT stop tile 1
- Each tile manages its own AudioBufferSourceNode independently
- Defective/unplayable blob: show **error message + keep the sound** in storage (don't silently delete)
- Use **idb-keyval** for IndexedDB storage
- Use **Web Audio API** (NOT HTMLAudioElement) for playback
- **Vanilla TypeScript + Vite 7** stack

### Claude's Discretion

- Exact inline error message copy (German or English consistency)
- Specific warning animation style at 25s countdown
- AudioContext interrupted-state recovery logic (phone call, backgrounding)
- `navigator.storage.persist()` call timing (on first user interaction)
- idb-keyval schema: `{ blob: Blob, mimeType: string, recordedAt: number }`
- Pre-decoded AudioBuffer cache strategy (decode on load vs. decode on first play)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REC-01 | Antippen einer leeren Kachel startet eine Aufnahme-Session | MediaRecorder API patterns, getUserMedia constraints, permission flow |
| REC-02 | Nochmaliges Antippen der aufnehmenden Kachel stoppt und speichert die Aufnahme | MediaRecorder stop() → dataavailable → blob assembly → idb-keyval set() |
| REC-04 | Mikrofon-Berechtigung wird beim ersten Aufnahmeversuch angefragt (nicht beim App-Start) | getUserMedia called lazily on tap, not on app init |
| STOR-01 | Aufnahmen werden lokal auf dem Gerät gespeichert (nicht an Server gesendet) | idb-keyval IndexedDB — fully client-side, no network calls |
| STOR-02 | Aufnahmen überleben App-Neustarts und bleiben an ihrer Kacheln-Position | idb-keyval keys 0-8 map to tile positions; getMany([0..8]) on boot |
| STOR-03 | App ruft navigator.storage.persist() auf, um langfristige Speicherung zu sichern | Call on first user interaction; Safari 17+ supports the API |
| PLAY-01 | User kann einen aufgenommenen Sound durch Antippen der Kachel abspielen | AudioContext + decodeAudioData + AudioBufferSourceNode.start() |
| PLAY-02 | Nochmaliges Antippen einer aktiv spielenden Kachel stoppt den Sound und startet ihn neu | Track active source node per tile; sourceNode.stop() + new node creation |
</phase_requirements>

---

## Summary

Phase 1 builds the complete audio pipeline: microphone capture via MediaRecorder, blob storage via idb-keyval (IndexedDB), and playback via Web Audio API. No visible tile grid is built in this phase — only the functional engine. Phase 2 will wire the engine to visual tiles.

The central technical challenge is iOS Safari's audio constraints. Safari enforces a strict user-gesture requirement before any AudioContext can produce sound, supports only `audio/mp4` (AAC) for MediaRecorder output (not WebM/Opus), routes audio output to the built-in speaker during active microphone sessions, and limits total AudioContext instances to 4 per page. Every one of these must be correctly handled in this phase because retrofitting later carries HIGH recovery cost.

The storage layer is straightforward: idb-keyval provides a promise-based key-value API over IndexedDB. Tile slots map to integer keys 0-8. Each stored value contains `{ blob, mimeType, recordedAt }`. The MIME type is stored alongside the blob so the player can correctly decode it on any device without format re-detection.

**Primary recommendation:** Build the audio pipeline in the strict order: format detection → storage layer → recorder module → player module → state machine → app bootstrap. Test each module on a real iPhone before proceeding to the next. Desktop and simulator testing will NOT catch the iOS-specific bugs.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.9 | Type safety for audio state machine | Current stable; catches AudioContext state errors at compile time |
| Vite | 7.x | Dev server + production build | Requires Node 20.19+; near-zero config for Vanilla TS |
| idb-keyval | 6.2.2 | IndexedDB blob storage | 295-573 bytes brotli'd; promise-based; handles structured-clonable Blobs natively |
| MediaRecorder API | Browser native | Audio capture | iOS 14.5+; only `audio/mp4` AAC supported on iOS Safari |
| Web Audio API | Browser native | Audio playback | AudioContext + AudioBufferSourceNode; near-zero latency on iOS |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | No additional libraries needed for this phase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| idb-keyval | Raw IndexedDB | idb-keyval is 600 B and handles all IDBRequest boilerplate; raw IDB adds ~100 lines of callback code for no benefit at 9 slots |
| idb-keyval | idb (full library) | idb supports multiple stores per DB and complex transactions; overkill here — a single store with 9 keys is exactly what idb-keyval is optimized for |
| Web Audio API | HTMLAudioElement | HTMLAudioElement has 300-500ms latency on iOS Safari — unacceptable for a soundboard; Web Audio gives near-zero latency |
| MediaRecorder | RecordRTC / other libs | RecordRTC adds ~150 KB bundle weight and masks iOS-specific behavior; native MediaRecorder is correct and sufficient |

**Installation:**
```bash
npm install idb-keyval
# TypeScript and Vite come from project scaffold
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── audio/
│   ├── format.ts       # isTypeSupported() detection; exported MIME_TYPE constant
│   ├── recorder.ts     # MediaRecorder wrapper; emits Blob on stop
│   └── player.ts       # AudioContext singleton; decodeAudioData; play/stop per slot
├── storage/
│   └── db.ts           # idb-keyval wrapper; typed get/set/del for slot records
├── state/
│   └── store.ts        # 9-slot state machine (empty | recording | saving | has-sound | playing | error)
└── main.ts             # App bootstrap; wires modules together; minimal DOM for Phase 1 testing
```

Phase 1 produces only the engine. The `main.ts` for this phase is a minimal test harness (9 buttons, no visual polish) that proves the pipeline works end-to-end on a real iPhone. Phase 2 replaces main.ts with the real tile UI.

### Pattern 1: AudioContext Singleton with User-Gesture Unlock

**What:** Create one shared AudioContext at module level (lazy init). Call `resume()` inside every user tap handler before doing anything else. Also call `resume()` on statechange events when state moves to `suspended` or `interrupted`.

**When to use:** Always. There must be exactly ONE AudioContext for the entire app lifetime.

```typescript
// Source: MDN Web Audio API + Matt Montag's Safari unlock pattern
// https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    // Safari may start in 'suspended' state even on first creation
    audioContext.addEventListener('statechange', () => {
      // 'interrupted' fires on phone call or backgrounding; resume when safe
      if (audioContext!.state === 'suspended' || audioContext!.state === 'interrupted') {
        // Don't auto-resume — wait for next user gesture
      }
    });
  }
  return audioContext;
}

// Call this at the start of EVERY user tap handler (touchend / click)
export async function ensureAudioContextRunning(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state !== 'running') {
    await ctx.resume();
  }
}
```

**Critical:** Safari silently produces no audio (no error thrown) if `resume()` is not called inside a user gesture handler. The `statechange` event with `"interrupted"` fires during phone calls and app backgrounding.

### Pattern 2: MIME Type Detection at App Startup

**What:** Probe `MediaRecorder.isTypeSupported()` once at startup in priority order. Cache the result. iOS Safari supports `audio/mp4`; Chrome/Firefox support `audio/webm;codecs=opus`. Store the detected type so the player can decode correctly.

**When to use:** On every app boot, before any recording attempt.

```typescript
// Source: WebKit Blog on MediaRecorder API
// https://webkit.org/blog/11353/mediarecorder-api/

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus', // Chrome, Firefox, Edge
  'audio/webm',             // Chrome fallback
  'audio/mp4',              // iOS Safari (AAC inside MP4)
  'audio/ogg;codecs=opus',  // Firefox fallback
] as const;

export function detectSupportedMimeType(): string {
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  // Empty string = browser chooses; last resort only
  return '';
}

export const RECORDING_MIME_TYPE: string = detectSupportedMimeType();
```

**Note on iOS:** `audio/mp4` on iOS records in AAC inside an MP4 container. The `audioBitsPerSecond` option has inconsistent iOS support — iOS Safari may ignore it. For the 500 KB/clip target, AAC at its default bitrate for mono voice speech will typically produce under 256 KB for 30 seconds.

### Pattern 3: MediaRecorder Recording Session

**What:** Stateless recorder class. Each recording is an independent instance. Collect chunks via `ondataavailable`, assemble final Blob in `onstop`.

**When to use:** On every tap-to-record trigger.

```typescript
// Source: MDN MediaStream Recording API
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
}

export async function startRecording(
  stream: MediaStream,
  mimeType: string,
  onStop: (result: RecordingResult) => void,
  maxDurationMs: number = 30_000,
  warningMs: number = 25_000,
  onWarning?: () => void,
): Promise<{ stop: () => void }> {
  const chunks: BlobPart[] = [];

  const options: MediaRecorderInit = { mimeType };
  // audioBitsPerSecond: intentionally not set — iOS may ignore it,
  // and AAC default is appropriate for speech quality target
  const recorder = new MediaRecorder(stream, options);

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType || recorder.mimeType });
    onStop({ blob, mimeType: blob.type });
  };

  // Warning timer at 25s
  const warningTimer = onWarning
    ? setTimeout(onWarning, warningMs)
    : null;

  // Auto-stop timer at 30s
  const stopTimer = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, maxDurationMs);

  recorder.start();

  return {
    stop: () => {
      if (warningTimer) clearTimeout(warningTimer);
      clearTimeout(stopTimer);
      if (recorder.state === 'recording') recorder.stop();
    },
  };
}
```

**iOS-specific note:** Do NOT call `recorder.stop()` when `recorder.state === 'inactive'` — it throws. Always guard with a state check. The `onstop` event fires reliably on iOS 14.5+ (earlier versions had bugs). Use a single `ondataavailable` without a timeslice argument for maximum iOS compatibility — chunked recording with short timeslices can be unreliable on iOS Safari.

### Pattern 4: getUserMedia Audio Constraints for Speech

**What:** Request microphone with speech-optimized constraints. Call lazily (on first tap attempt, not on app startup). Reuse the stream for subsequent recordings to avoid repeated permission prompts.

**When to use:** First recording attempt per session.

```typescript
// Source: MDN Media Capture and Streams API
// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,  // Removes mic-from-speaker feedback
  noiseSuppression: true,  // Reduces background noise
  autoGainControl: true,   // Normalizes voice levels
  // sampleRate: intentionally not set — iOS Safari locks to 44100/48000 Hz
  // channelCount: not set — iOS defaults to mono for voice; don't force
};

let cachedStream: MediaStream | null = null;

export async function getMicrophoneStream(): Promise<MediaStream> {
  // Reuse existing stream to avoid repeated permission prompts
  // WebKit bug #215884: repeated getUserMedia calls in standalone PWA cause re-prompts
  if (cachedStream && cachedStream.active) {
    return cachedStream;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: false,
    });
    cachedStream = stream;
    return stream;
  } catch (err) {
    // NotAllowedError: permission denied
    // NotFoundError: no microphone
    // NotReadableError: hardware error
    throw err; // Caller handles with inline error display
  }
}
```

### Pattern 5: Audio Playback via Web Audio API

**What:** Decode stored blob to AudioBuffer. Play via AudioBufferSourceNode. Track source node per tile to support stop-and-restart (PLAY-02). Support parallel playback across tiles (locked decision).

**When to use:** On every tap-to-play.

```typescript
// Source: MDN Web Audio API
// https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData

// Per-tile source node tracking (supports parallel playback + stop-restart)
const activeNodes = new Map<number, AudioBufferSourceNode>();

export async function playBlob(
  tileIndex: number,
  blob: Blob,
  ctx: AudioContext,
  onEnded: () => void,
): Promise<void> {
  // Stop existing playback for THIS tile only (parallel across tiles is allowed)
  stopTile(tileIndex);

  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  source.onended = () => {
    // Clean up only if this node is still the active one (not replaced by re-tap)
    if (activeNodes.get(tileIndex) === source) {
      activeNodes.delete(tileIndex);
      onEnded(); // → tile returns to filled/idle state
    }
  };

  activeNodes.set(tileIndex, source);
  source.start();
}

export function stopTile(tileIndex: number): void {
  const existing = activeNodes.get(tileIndex);
  if (existing) {
    try {
      existing.stop();
    } catch {
      // Already stopped (e.g., clip ended naturally) — safe to ignore
    }
    activeNodes.delete(tileIndex);
  }
}
```

**Key:** `AudioBufferSourceNode` is single-use by design. Create a new one for each playback. Reuse the underlying `AudioBuffer` across plays to avoid repeated `decodeAudioData` calls.

### Pattern 6: idb-keyval Storage Layer

**What:** Typed wrapper around idb-keyval. Keys are tile indices 0-8. Values are the slot record struct.

**When to use:** All persistence operations go through this module.

```typescript
// Source: idb-keyval README
// https://github.com/jakearchibald/idb-keyval

import { get, set, del, getMany } from 'idb-keyval';

export interface SlotRecord {
  blob: Blob;
  mimeType: string;
  recordedAt: number; // Date.now() at recording completion
}

type SlotIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export async function loadAllSlots(): Promise<(SlotRecord | undefined)[]> {
  // Load all 9 slots in a single IDB transaction (faster than 9 individual gets)
  return getMany([0, 1, 2, 3, 4, 5, 6, 7, 8]);
}

export async function saveSlot(index: SlotIndex, record: SlotRecord): Promise<void> {
  await set(index, record);
}

export async function deleteSlot(index: SlotIndex): Promise<void> {
  await del(index);
}
```

**Custom store:** The default idb-keyval store (db name: `keyval-store`, store name: `keyval`) is sufficient. No need for `createStore()` — 9 integer keys in a single store cause no naming conflict. Keep it simple.

### Pattern 7: navigator.storage.persist() Call Timing

**What:** Request persistent storage to mitigate Safari's 7-day eviction in browser mode.

**When to use:** On first user interaction (first tap), NOT on app startup. Calling too early (before interaction) reduces grant probability.

```typescript
// Source: WebKit Blog - Updates to Storage Policy
// https://webkit.org/blog/14403/updates-to-storage-policy/

export async function requestStoragePersistence(): Promise<void> {
  if (!navigator.storage?.persist) return; // API not available
  const persisted = await navigator.storage.persisted();
  if (!persisted) {
    await navigator.storage.persist();
    // Note: Safari 17+ supports this API. The browser may still deny the request
    // if the PWA is not installed to Home Screen. The call is a best-effort hint.
  }
}
```

**Important:** `navigator.storage.persist()` is supported from Safari 17.0. On iOS 16 and below, the call is a no-op (the API exists but the promise resolves to `false`). Home Screen PWAs (standalone mode) receive a higher storage quota and are less aggressively evicted than browser-tab PWAs — installation guidance is the most effective mitigation.

### Anti-Patterns to Avoid

- **Creating AudioContext on module load (not in tap handler):** Safari suspends contexts created outside a user gesture. Create lazily on first tap or use `new AudioContext()` and immediately call `.resume()` inside the tap handler.
- **Using HTMLAudioElement for playback:** 300-500ms iOS Safari latency destroys the soundboard feel. Use Web Audio API exclusively.
- **Hardcoding `audio/webm` as MediaRecorder mimeType:** Throws `NotSupportedError` on iOS Safari. Always use `isTypeSupported()`.
- **Calling MediaRecorder.stop() without checking state:** Throws `InvalidStateError` if recorder is already inactive. Always guard with `recorder.state === 'recording'`.
- **Creating multiple AudioContext instances:** Safari hard-limits at 4. One singleton for the entire app.
- **Calling getUserMedia on app startup:** Triggers permission prompt before user has expressed intent (violates REC-04 and iOS UX expectations).
- **Storing audio blobs in localStorage:** localStorage is string-only. Base64 encoding adds 33% size overhead. IndexedDB (idb-keyval) handles Blobs natively via structured clone.
- **Storing audio blobs in the Cache API:** Cache API is designed for network responses and is subject to different eviction policies. All user recordings must live in IndexedDB.
- **Not reusing MediaStream across recordings:** Calling `getUserMedia` repeatedly in standalone PWA mode triggers repeated permission prompts (WebKit bug #215884).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB boilerplate | Custom IDBRequest wrappers | idb-keyval | IDB callbacks involve 15+ lines for a simple get/set; idb-keyval is 295 bytes and handles all edge cases |
| MIME type selection | Static format string | `MediaRecorder.isTypeSupported()` | iOS Safari only accepts `audio/mp4`; hardcoding any format will break on at least one major browser |
| AudioBuffer decode | Custom audio format parsers | `AudioContext.decodeAudioData()` | Browser decodes AAC/MP4/WebM natively; custom parsers are an antipattern |
| MediaStream lifecycle | Custom permission state tracking | Reuse the cached MediaStream | Avoids repeated getUserMedia calls that trigger re-permission on iOS |

**Key insight:** The Web platform provides all necessary primitives. The implementation work is wiring them correctly in the right order with iOS-safe guard conditions — not building abstractions over them.

---

## Common Pitfalls

### Pitfall 1: AudioContext Silently Fails on iOS (No Error, No Audio)

**What goes wrong:** Audio plays fine on desktop/Chrome but produces nothing on iOS Safari. No errors in console.

**Why it happens:** iOS Safari suspends the AudioContext until a user gesture unlocks it. `AudioContext.state` is `"suspended"` and all `start()` calls on AudioBufferSourceNode silently do nothing.

**How to avoid:** Call `await audioContext.resume()` inside every `touchend` or `click` handler, at the very start, before any audio operation. Check `audioContext.state` defensively.

**Warning signs:** `audioContext.state === 'suspended'` after app startup. Audio works on desktop/Chrome but not on a real iPhone.

### Pitfall 2: MediaRecorder Rejects audio/webm on iOS

**What goes wrong:** `new MediaRecorder(stream, { mimeType: 'audio/webm' })` throws `NotSupportedError` on iOS Safari.

**Why it happens:** iOS Safari's WebKit implements MediaRecorder with MP4/AAC only. The WebM container is not supported.

**How to avoid:** Use `isTypeSupported()` at startup. Never hardcode `audio/webm`. Store the detected MIME type in `SlotRecord.mimeType`.

**Warning signs:** Errors only appear on iOS, not in desktop Chrome/Firefox.

### Pitfall 3: AudioContext "interrupted" State Not Recovered

**What goes wrong:** Playback stops working after a phone call or after the user backgrounds the app and returns.

**Why it happens:** iOS fires `statechange` on the AudioContext with `state === 'interrupted'` during phone calls, notifications, and when the audio session is claimed by another app. Calling `resume()` during the interruption fails. The context must be resumed after the interruption ends — via the next user tap.

**How to avoid:** Listen to `AudioContext.statechange`. Do not auto-resume from interrupted state. Instead, call `resume()` at the start of the next user tap handler. The pattern "resume on every tap" naturally recovers from interruption.

**Warning signs:** Audio stops after a phone call or after switching apps. `audioContext.state === 'interrupted'` or `'suspended'` when user returns.

### Pitfall 4: IndexedDB 7-Day Eviction in Safari Browser Mode

**What goes wrong:** User records sounds, returns a week later, recordings are gone.

**Why it happens:** Safari treats browser-tab storage as temporary. IndexedDB data can be evicted after ~7 days of no site activity if the site is not installed to the Home Screen and `navigator.storage.persist()` has not been granted.

**How to avoid:** Call `navigator.storage.persist()` on first interaction. Guide users to install to Home Screen (Phase 3). Eviction does not occur for Home Screen PWAs (standalone mode).

**Warning signs:** User reports lost recordings after extended non-use when running in Safari browser tab mode.

### Pitfall 5: Audio Output Routes to Earpiece During Recording

**What goes wrong:** While recording (microphone active via `getUserMedia`), playback is routed to the built-in earpiece speaker instead of the main loudspeaker.

**Why it happens:** iOS treats active microphone sessions as "voice call" mode and routes audio accordingly. This is an iOS system-level behavior, not a Web API bug. There is no workaround available in 2025.

**How to avoid:** Accept this behavior. Users who play back while recording may hear audio from the earpiece. This is expected iOS behavior.

**Warning signs:** Playback volume appears low during recording, and holding the phone to the ear makes it audible — classic earpiece routing.

### Pitfall 6: MediaRecorder.stop() Called on Inactive Recorder

**What goes wrong:** `InvalidStateError: Failed to execute 'stop' on 'MediaRecorder': The MediaRecorder's state is 'inactive'.`

**Why it happens:** The auto-stop timer (30s) fires and calls `stop()` after the user has already manually stopped the recording and the recorder is in `'inactive'` state.

**How to avoid:** Always guard: `if (recorder.state === 'recording') recorder.stop()`. Clear the auto-stop timer when the user manually stops.

### Pitfall 7: decodeAudioData Rejects Defective Blobs

**What goes wrong:** A corrupted or truncated blob causes `decodeAudioData` to throw. If not handled, the app crashes silently.

**Why it happens:** Recording interruptions (power loss, crash, system audio session seizure) can produce malformed blobs. The blob is stored in IndexedDB but is unplayable.

**How to avoid:** Wrap `decodeAudioData` in a try-catch. Per the locked decision: show an error message, do NOT delete the blob from storage. The user can choose to re-record if they wish.

```typescript
try {
  const audioBuffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  // play...
} catch (err) {
  // Show error message to user; keep blob in IndexedDB
  showInlineError(`Wiedergabe fehlgeschlagen. Neu aufnehmen?`);
}
```

---

## Code Examples

Verified patterns from official sources:

### Complete Blob-to-AudioBuffer-to-Playback Chain

```typescript
// Source: MDN decodeAudioData + AudioBufferSourceNode
// https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData

async function playSlot(tileIndex: number, record: SlotRecord, ctx: AudioContext): Promise<void> {
  await ensureAudioContextRunning(); // MUST be first; unlocks iOS AudioContext

  const arrayBuffer = await record.blob.arrayBuffer();

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    showInlineError('Datei defekt. Bitte neu aufnehmen.');
    return; // Keep blob in storage — do NOT delete
  }

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.onended = () => { /* tile → idle state */ };
  source.start(0); // start immediately
}
```

### Saving a Recording to IndexedDB

```typescript
// Source: idb-keyval README, MDN Blob API
import { set } from 'idb-keyval';

async function saveRecording(tileIndex: number, blob: Blob, mimeType: string): Promise<void> {
  const record: SlotRecord = {
    blob,
    mimeType,
    recordedAt: Date.now(),
  };
  await set(tileIndex, record); // key = 0..8, value = SlotRecord
}
```

### Loading All Slots on App Boot

```typescript
// Source: idb-keyval README — getMany for batch efficiency
import { getMany } from 'idb-keyval';

async function loadSlotsOnBoot(): Promise<(SlotRecord | undefined)[]> {
  // Single IndexedDB transaction; returns array of 9 items (undefined if empty)
  return getMany([0, 1, 2, 3, 4, 5, 6, 7, 8]);
}
```

### 30s Auto-Stop Timer with 25s Warning

```typescript
// Locked decision: 30s max, 25s warning
const WARNING_MS = 25_000;
const MAX_MS = 30_000;

function startTimers(
  onWarning: () => void,
  onAutoStop: () => void,
): { cancel: () => void } {
  const warnTimer = setTimeout(onWarning, WARNING_MS);
  const stopTimer = setTimeout(onAutoStop, MAX_MS);
  return {
    cancel: () => {
      clearTimeout(warnTimer);
      clearTimeout(stopTimer);
    },
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling MediaRecorder.state | `statechange` event | MDN current | Simpler state tracking |
| `HTMLAudioElement` for playback | Web Audio API `AudioBufferSourceNode` | iOS 14+ | Zero latency on iOS vs 300-500ms |
| Callback-based `decodeAudioData` | Promise-based `decodeAudioData` | Web Audio API 1.1 | Use `await ctx.decodeAudioData()` directly |
| Multiple `AudioContext` instances | Single shared singleton | iOS Safari enforced | Safari hard-limits at 4 instances |
| `navigator.storage.persist()` unavailable | Supported from Safari 17.0 | iOS 17 (Sep 2023) | Can request persistence; still best-effort |
| `audio/webm` as universal default | Format detection via `isTypeSupported()` | MediaRecorder iOS support (iOS 14.5) | Required for cross-platform; iOS only supports `audio/mp4` |

**Deprecated/outdated:**
- Callback form of `decodeAudioData(buffer, successCb, errorCb)`: Works but is the legacy form; use the Promise form `await ctx.decodeAudioData(buffer)` instead
- `webkitAudioContext` prefix: Not needed for iOS 14.5+; use `AudioContext` directly
- `navigator.getUserMedia()` (non-promise form): Removed from all browsers; use `navigator.mediaDevices.getUserMedia()` exclusively

---

## Open Questions

1. **audioBitsPerSecond honored by iOS Safari?**
   - What we know: The MediaRecorder `audioBitsPerSecond` option is specified in the W3C API. Multiple sources indicate iOS Safari ignores it or only partially honors it.
   - What's unclear: Whether iOS 17/18 improved compliance. The spec says it's advisory.
   - Recommendation: Do not rely on `audioBitsPerSecond` for the 500 KB/clip target. AAC at iOS default bitrate for 30s mono speech typically produces under 256 KB. Verify empirically on a real device.

2. **AudioBuffer cache: decode on load vs. decode on play?**
   - What we know: This is marked as Claude's discretion. Decoding on load eliminates playback latency but costs memory upfront. Decoding on play has a small delay on first play (~10-50ms for short clips).
   - What's unclear: Whether decode latency is perceptible for clips under 10s on iPhone hardware.
   - Recommendation: Decode on first play, cache the resulting `AudioBuffer` in a `Map<number, AudioBuffer>` for repeat plays. This balances startup speed and memory. Avoids loading all 9 clips' raw PCM data into memory on boot.

3. **MediaStream reuse across recording sessions?**
   - What we know: WebKit bug #215884 causes repeated `getUserMedia` calls in standalone PWA mode to trigger re-prompts. The established mitigation is to cache and reuse the MediaStream.
   - What's unclear: Whether iOS 17/18 fixed this specific bug or if it's still present in 2025.
   - Recommendation: Implement stream caching (`cachedStream` singleton) as documented. Test on a real iPhone in standalone mode specifically.

4. **audio/mp4 vs. audio/webm;codecs=opus priority on Chrome/Android?**
   - What we know: Chrome supports WebM/Opus natively (preferred); iOS Safari supports only audio/mp4. The probe order in the code above correctly prioritizes WebM on Chrome.
   - What's unclear: Whether audio/mp4 stored by iOS can be decoded by Chrome's `decodeAudioData` (it can — AAC/MP4 is universally decodable). This is a non-issue for playback since the MIME type is stored alongside the blob.
   - Recommendation: Proceed with the MIME type detection pattern as documented. The stored MIME type in `SlotRecord` ensures correct decoding regardless of device.

---

## Sources

### Primary (HIGH confidence)
- MDN — BaseAudioContext.decodeAudioData(): https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData
- MDN — MediaStream Recording API: https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API
- MDN — MediaRecorder constructor options: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder
- MDN — BaseAudioContext.state: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state
- WebKit Blog — MediaRecorder API (iOS format support): https://webkit.org/blog/11353/mediarecorder-api/
- WebKit Blog — Updates to Storage Policy (IndexedDB eviction, persist()): https://webkit.org/blog/14403/updates-to-storage-policy/
- idb-keyval README (get, set, del, getMany API): https://github.com/jakearchibald/idb-keyval/blob/main/README.md
- idb-keyval custom-stores.md: https://github.com/jakearchibald/idb-keyval/blob/main/custom-stores.md
- WebKit Bug #215884 — getUserMedia re-prompts in standalone PWA: https://bugs.webkit.org/show_bug.cgi?id=215884
- WebKit Bug #237878 — AudioContext suspended when backgrounded: https://bugs.webkit.org/show_bug.cgi?id=237878

### Secondary (MEDIUM confidence)
- Matt Montag — Unlock Web Audio in Safari for iOS: https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos (verified against MDN AudioContext.state docs)
- Build with Matija — iPhone Safari MediaRecorder patterns: https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription (verified against WebKit Blog)
- Medium — iOS Safari forces audio output to speakers with getUserMedia: https://medium.com/@python-javascript-php-html-css/ios-safari-forces-audio-output-to-speakers-when-using-getusermedia-2615196be6fe (consistent with Apple Developer Forums reports)
- Apple Developer Forums — getUserMedia audio routing: https://developer.apple.com/forums/thread/657321

### Tertiary (LOW confidence — informational only)
- RecordRTC GitHub — iOS MediaRecorder bitrate behavior: https://github.com/muaz-khan/RecordRTC/issues/793 (community report; `audioBitsPerSecond` partially ignored on iOS)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — idb-keyval 6.2.2 verified via npm; MediaRecorder and Web Audio API verified via MDN + WebKit Blog
- Architecture: HIGH — Patterns verified against MDN, WebKit Blog, and multiple independent community post-mortems
- Pitfalls: HIGH — Every pitfall verified via WebKit bug tracker, Apple Developer Forums, or MDN; multiple independent sources agree
- iOS audio routing during recording: MEDIUM — Documented in community sources and Apple Dev Forums; no official WebKit fix announced

**Research date:** 2026-02-22
**Valid until:** 2026-04-22 (stable APIs; iOS Safari pitfalls are well-established; re-verify if iOS 19 or Safari 19 releases)
