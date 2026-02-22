# Architecture Research

**Domain:** PWA Soundboard — single-screen audio recorder/player for iPhone
**Researched:** 2026-02-22
**Confidence:** HIGH (core audio pipeline, IndexedDB) / MEDIUM (iOS edge cases)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          UI Layer (DOM)                                  │
│                                                                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐   ×9 tiles                │
│  │  TileView │  │  TileView │  │  TileView │   (empty / recorded)       │
│  │  (empty)  │  │(recording)│  │ (has sound)│                           │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                           │
│        │              │              │                                   │
│        └──────────────┴──────────────┘                                  │
│                        │ events (tap, long-press)                        │
├────────────────────────┼────────────────────────────────────────────────┤
│                   State Controller                                       │
│            (9-slot array, current mode per tile)                        │
│                        │                                                 │
│         ┌──────────────┼──────────────┐                                 │
│         ↓              ↓              ↓                                  │
├─────────────────┬──────────────┬──────────────────────────────────────┤
│  Audio Pipeline │  Storage API │         Service Worker               │
│                 │              │                                        │
│ ┌─────────────┐ │ ┌──────────┐ │  ┌──────────────────────────────┐   │
│ │  Recorder   │ │ │IndexedDB │ │  │  Cache: App Shell (HTML/CSS/ │   │
│ │ (MediaRec.) │ │ │ (idb-    │ │  │  JS) → Cache-First           │   │
│ └──────┬──────┘ │ │  keyval) │ │  │                              │   │
│        ↓        │ └──────────┘ │  │  Audio blobs: NOT cached by  │   │
│ ┌─────────────┐ │              │  │  SW — stored in IndexedDB     │   │
│ │  Player     │ │              │  └──────────────────────────────┘   │
│ │ (Web Audio) │ │              │                                        │
│ └─────────────┘ │              │                                        │
└─────────────────┴──────────────┴──────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `TileView` (×9) | Render tile state (empty/recording/has-sound), handle tap and long-press events | State Controller (events up, state down) |
| `State Controller` | Single source of truth: 9-slot array of `{ id, state, audioBlob? }`, orchestrates all transitions | TileView (render updates), Audio Pipeline, Storage API |
| `Recorder` | Acquire microphone, manage MediaRecorder lifecycle, emit final Blob on stop | State Controller (receives start/stop, emits blob) |
| `Player` | Decode stored Blob via Web Audio API, play with low latency through shared AudioContext | State Controller (receives play command + blob) |
| `Storage API` | Wrap IndexedDB via idb-keyval: read all slots on boot, persist blob+metadata on save, delete on remove | State Controller (called after state transitions) |
| `ContextMenu` | Render long-press overlay with Delete/Re-record options | State Controller (dispatches chosen action) |
| `Service Worker` | Precache app shell (HTML, CSS, JS, manifest, icons) for offline use | Browser cache (install-time), does NOT touch audio blobs |

---

## Recommended Project Structure

```
src/
├── index.html               # App entry point, registers service worker
├── manifest.json            # PWA manifest (name, icons, display: standalone)
├── sw.js                    # Service worker — precache app shell only
├── app.js                   # Bootstrap: init storage → render tiles → attach events
│
├── components/
│   ├── tile.js              # TileView: DOM creation, state class toggling, event binding
│   └── context-menu.js      # Long-press overlay (Delete / Re-record)
│
├── audio/
│   ├── recorder.js          # MediaRecorder wrapper: start/stop, format detection, blob emit
│   ├── player.js            # Web Audio API wrapper: AudioContext singleton, decodeAudioData, play
│   └── format.js            # getSupportedMimeType(): audio/mp4 on iOS, webm/opus elsewhere
│
├── state/
│   └── store.js             # 9-slot reactive store, emits change events consumed by tile.js
│
├── storage/
│   └── db.js                # idb-keyval wrapper: loadAll(), save(id, blob, mimeType), remove(id)
│
└── styles/
    └── main.css             # Grid layout, tile states, long-press prevention CSS
```

### Structure Rationale

- **`audio/`:** Isolates all Web API complexity. `recorder.js` and `player.js` never talk to each other directly — the state controller mediates. This lets you test or swap either independently.
- **`state/`:** Single store prevents tiles from holding their own state, which leads to drift. Nine slots only — no normalization needed.
- **`storage/`:** Keeps IndexedDB calls out of state and UI layers. All DB access goes through one module.
- **`sw.js` at root:** Service worker scope must cover entire origin — placing it at root avoids scope restriction issues.
- **No framework:** The app is a single screen with 9 elements. A framework adds 30–300 KB for zero architectural benefit here.

---

## Architectural Patterns

### Pattern 1: Single AudioContext Singleton (iOS Mandatory)

**What:** Create exactly one `AudioContext` per page load, unlock it on first user tap, reuse for all playback.

**When to use:** Always — iOS Safari hard-limits to 4 AudioContext instances per page. Creating one per tile hits the limit after 4 taps.

**Trade-offs:** Slightly more coordination needed to route multiple simultaneous sounds; for a 9-tile soundboard this is a non-issue since only one sound plays at a time.

**Example:**
```javascript
// audio/player.js
let ctx = null;

function getAudioContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

// Called from first user interaction handler BEFORE any playback
export async function unlockAudio() {
  const context = getAudioContext();
  if (context.state === 'suspended') {
    await context.resume();
  }
}

export async function playBlob(blob) {
  const context = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(arrayBuffer);
  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(context.destination);
  source.start(0);
}
```

### Pattern 2: Format Detection Before Recording

**What:** Call `MediaRecorder.isTypeSupported()` at startup to pick the best supported format, store the MIME type alongside the blob.

**When to use:** Always — iOS Safari only supports `audio/mp4` (AAC). Chrome/Firefox support `audio/webm;codecs=opus`. The wrong assumption will silently produce unplayable blobs or throw at record time.

**Trade-offs:** A few extra lines of detection logic; necessary complexity, not accidental.

**Example:**
```javascript
// audio/format.js
const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',  // Chrome, Firefox, Safari 18.4+
  'audio/mp4',               // iOS Safari (AAC inside MP4)
  'audio/ogg;codecs=opus',   // Firefox fallback
  'audio/webm',              // Chrome fallback
];

export function getSupportedMimeType() {
  for (const type of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ''; // Let browser choose default
}
```

The `mimeType` string is stored in IndexedDB alongside the blob, then passed to `new Blob([...chunks], { type: mimeType })` at stop time, and used when constructing the blob for `decodeAudioData`.

### Pattern 3: Tap-to-Toggle Recording (State Machine per Tile)

**What:** Each tile slot has an explicit state machine: `empty → recording → saving → has-sound`. The state controller manages transitions; the UI reflects state via CSS classes only.

**When to use:** Always for interaction correctness. Without explicit states, double-taps or concurrent recordings cause race conditions.

**States:**
```
empty       → [tap] → recording
recording   → [tap] → saving (async: stop recorder, wait for blob, write to IDB)
saving      → [done] → has-sound
has-sound   → [tap] → playing (transient, auto-returns to has-sound)
has-sound   → [long-press → delete] → empty
has-sound   → [long-press → re-record] → recording
```

**Constraint:** Only one tile can be in `recording` state at a time (single microphone).

### Pattern 4: Blob-in-IndexedDB (Not Cache API)

**What:** User-recorded audio blobs are stored in IndexedDB, not in the Cache API or service worker caches.

**When to use:** Always for user-generated persistent data. Cache API is designed for HTTP response caching and has 7-day eviction on iOS Safari for inactive PWAs. IndexedDB is the correct persistent store for application data.

**Schema:**
```javascript
// storage/db.js — using idb-keyval (573 bytes brotli'd, zero dependencies)
// Store name: 'soundboard'
// Key: slot index (0–8)
// Value: { blob: Blob, mimeType: string, recordedAt: number }

import { get, set, del, entries } from 'idb-keyval';

export async function loadAll() {
  // Returns array of [key, value] pairs for all 9 slots
  return entries();
}

export async function save(slotIndex, blob, mimeType) {
  await set(slotIndex, { blob, mimeType, recordedAt: Date.now() });
}

export async function remove(slotIndex) {
  await del(slotIndex);
}
```

---

## Data Flow

### Record Flow

```
User taps empty tile
     ↓
TileView emits 'tile:tap' event → State Controller
     ↓
State Controller: slot[i].state = 'recording'
     ↓
Recorder.start(mimeType) — getUserMedia() prompt if first time
     ↓
TileView re-renders tile with 'recording' class (pulsing indicator)
     ↓
User taps tile again
     ↓
TileView emits 'tile:tap' event → State Controller
     ↓
State Controller: slot[i].state = 'saving'
     ↓
Recorder.stop() → MediaRecorder fires onstop → assembles Blob from chunks
     ↓
Storage.save(i, blob, mimeType)  [async, awaited]
     ↓
State Controller: slot[i].state = 'has-sound', slot[i].blob = blob
     ↓
TileView re-renders tile with 'has-sound' class
```

### Play Flow

```
User taps has-sound tile
     ↓
TileView emits 'tile:tap' → State Controller
     ↓
State Controller calls Player.playBlob(slot[i].blob)
     ↓
Player: blob.arrayBuffer() → AudioContext.decodeAudioData() → BufferSourceNode.start()
     ↓
Sound plays; tile gets transient 'playing' class (optional visual feedback)
```

Note: Blobs are held in memory as part of state after initial load from IndexedDB. This is safe for 9 short audio clips (voice recordings typically <5 seconds = <50 KB each, total <500 KB in memory).

### Boot Flow

```
app.js loads
     ↓
ServiceWorker registers (if first load, installs app shell into cache)
     ↓
Storage.loadAll() — reads all entries from IndexedDB
     ↓
State Controller initializes 9-slot array from IDB data
     ↓
TileView renders all 9 tiles with correct initial states
     ↓
First user tap on any tile → unlockAudio() resumes AudioContext
```

### Long-Press Flow

```
User long-presses has-sound tile (touchstart → 500ms timer → touchend)
     ↓
TileView emits 'tile:longpress' → State Controller
     ↓
ContextMenu renders over tile with [Delete] [Re-record] buttons
     ↓
Delete: Storage.remove(i) → slot[i] = empty → TileView re-renders
Re-record: slot[i].state = 'recording' → Recorder.start() → existing blob replaced after stop
```

---

## Scaling Considerations

This is a local-only PWA with a fixed 9-slot model — "scaling" means device-level concerns, not server load.

| Concern | Reality | Approach |
|---------|---------|----------|
| Memory | 9 blobs × ~50 KB avg = ~450 KB | Hold all blobs in state in memory — fine |
| Storage | IndexedDB quota: ~50% of free disk on iOS | Far under limit for voice clips |
| Audio latency | `decodeAudioData` takes ~5-50ms per clip | Pre-decode blobs to AudioBuffers on boot if needed |
| iOS cache eviction | 7-day eviction for inactive PWAs (Cache API) | Audio in IndexedDB is not evicted on the same schedule |

**Pre-decode optimization (optional, phase 2):** On boot, decode all blobs to `AudioBuffer` objects and cache them in memory. Tapping a tile then calls `source.start()` with zero decode latency. At 9 clips × ~50 KB this costs ~450 KB RAM — acceptable.

---

## Anti-Patterns

### Anti-Pattern 1: Creating an AudioContext Per Tile

**What people do:** Instantiate `new AudioContext()` inside each tile's play handler.

**Why it's wrong:** iOS Safari allows a maximum of 4 AudioContext instances per page. After 4 tile taps, audio silently fails. Memory also accumulates.

**Do this instead:** Singleton `getAudioContext()` pattern — one context for the entire app, unlocked on first interaction, reused forever.

### Anti-Pattern 2: Storing Audio Blobs in the Cache API / Service Worker

**What people do:** Intercept save requests in the service worker and store blobs in `caches.open()`.

**Why it's wrong:** Cache API on iOS Safari has a 7-day inactivity eviction policy. User recordings disappear. Cache API is designed for cacheable HTTP responses, not user data.

**Do this instead:** IndexedDB via idb-keyval. User data belongs in IndexedDB.

### Anti-Pattern 3: Hardcoding `audio/webm` as Recording Format

**What people do:** Pass `mimeType: 'audio/webm;codecs=opus'` to `new MediaRecorder()` without checking support.

**Why it's wrong:** iOS Safari only supports `audio/mp4` (AAC). Passing an unsupported type throws `NotSupportedError` or silently records nothing.

**Do this instead:** `getSupportedMimeType()` detection at startup, store the detected type in state, pass it to `MediaRecorder` constructor and to `new Blob(chunks, { type })`.

### Anti-Pattern 4: Attaching Context Menu to `contextmenu` DOM Event on iOS

**What people do:** Listen for `contextmenu` event on tiles to detect long-press.

**Why it's wrong:** The `contextmenu` event does not fire reliably on iOS Safari (documented bug since iOS 13). It works on desktop Safari and macOS but not iPhone.

**Do this instead:** Implement long-press via `touchstart` → start a 500ms timer → cancel on `touchmove`/`touchend`. Use `-webkit-touch-callout: none` and `-webkit-user-select: none` CSS to suppress the native iOS callout popup from competing.

### Anti-Pattern 5: Using Framework State Management for 9 Slots

**What people do:** Reach for Redux, Zustand, or a full React app for a fixed-size soundboard.

**Why it's wrong:** A 9-element array with 4 possible states per slot is not complex state. A framework adds 30–300 KB of JS, a build pipeline, and abstraction overhead for zero user benefit on this use case.

**Do this instead:** A plain JavaScript object with a 9-element array as state, a `setState(index, patch)` function, and a `CustomEvent` or callback-based observer for tile re-renders.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Constraint |
|----------|---------------|------------|
| TileView ↔ State Controller | DOM CustomEvents up, direct method calls down | TileView never calls audio or DB APIs directly |
| State Controller ↔ Recorder | Direct function calls (`recorder.start()`, `recorder.stop()`) | Recorder is stateless between recordings |
| State Controller ↔ Player | Direct function call (`player.playBlob(blob)`) | Player only receives blobs, not slot indices |
| State Controller ↔ Storage | Async calls; state updates only after DB write confirms | Prevents state/storage drift on write failure |
| Audio Pipeline ↔ Format module | `getSupportedMimeType()` called once at startup | Result stored in module-level variable, not recomputed |

### iOS Audio Session Notes

- **AudioContext unlock:** Must happen inside a user gesture handler (touchend or click). Cannot be deferred to a promise `.then()` — Safari considers the gesture context expired by then.
- **Microphone permission:** `navigator.mediaDevices.getUserMedia({ audio: true })` prompts the user the first time. The browser remembers the grant — no need to re-request. In standalone PWA mode, the permission persists with the PWA identity.
- **Recording and playback simultaneously:** Avoid — iOS routes audio to the earpiece when a microphone session is active, not the speaker. Stop any active recording before playback.
- **Background audio:** Audio stops when a standalone PWA is backgrounded (WebKit bug 198277). This app is a tap-to-play soundboard — always used in foreground — so this limitation is irrelevant to the use case.

---

## Build Order (Phase Dependencies)

Based on component dependencies, build in this order:

1. **Storage layer** (`storage/db.js`) — no dependencies, pure IndexedDB calls
2. **Format detection** (`audio/format.js`) — no dependencies, pure browser API query
3. **Recorder** (`audio/recorder.js`) — depends on format detection
4. **Player** (`audio/player.js`) — depends on AudioContext singleton only
5. **State Controller** (`state/store.js`) — orchestrates storage + audio; build after both
6. **TileView** (`components/tile.js`) — pure rendering, depends only on state shape
7. **ContextMenu** (`components/context-menu.js`) — depends on TileView existing in DOM
8. **App bootstrap** (`app.js`) — wires all modules together
9. **Service Worker** (`sw.js`) — can be written last; app works without it during dev

Each layer can be tested independently before wiring the next. The audio pipeline (steps 2-4) should be verified on a real iOS device before building the UI on top.

---

## Sources

- [WebKit MediaRecorder API announcement](https://webkit.org/blog/11353/mediarecorder-api/) — iOS 14.3 format support (MP4/AAC)
- [Build with Matija: iPhone Safari MediaRecorder](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription) — `isTypeSupported()` pattern, iOS format pitfalls
- [Matt Montag: Unlock Web Audio in Safari/iOS](https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos) — AudioContext resume on user gesture
- [MDN: Web Audio API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) — single AudioContext, decodeAudioData
- [MDN: IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) — storage patterns
- [idb-keyval on npm](https://www.npmjs.com/package/idb-keyval) — 573 bytes, get/set/del API
- [MagicBell: iOS PWA Limitations](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — 7-day Cache API eviction, storage limits
- [PWA on iOS 2025 (brainhub)](https://brainhub.eu/library/pwa-on-ios) — current iOS PWA constraints
- [WebKit bug 198277](https://bugs.webkit.org/show_bug.cgi?id=198277) — background audio stops in standalone PWA
- [Raymond Camden: Vue Soundboard with IndexedDB](https://www.raymondcamden.com/2019/11/12/building-a-custom-sound-board-with-vue-and-indexeddb) — IndexedDB blob pattern for soundboards
- [Apple Developer Forums: contextmenu iOS](https://developer.apple.com/forums/thread/699834) — contextmenu event unreliable on iOS
- [Preventing iOS callout on long-press](https://additionalknowledge.com/2024/08/02/how-to-prevent-the-default-context-menu-live-preview-on-long-press-in-mobile-safari-chrome/) — CSS workarounds

---
*Architecture research for: iPhone PWA Soundboard*
*Researched: 2026-02-22*
