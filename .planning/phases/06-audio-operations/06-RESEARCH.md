# Phase 6: Audio Operations - Research

**Researched:** 2026-02-23
**Domain:** Web Audio API (silence trimming) + Web Share API (export/download)
**Confidence:** HIGH (trim algorithm), HIGH (share API behavior), MEDIUM (iOS-specific share edge cases)

---

## Summary

Phase 6 adds two independent features: auto-trim silence from clips (TRIM-01) and export clips via
the iOS share sheet or file download fallback (SHARE-01).

**Trim** is pure JavaScript: decode the blob to an AudioBuffer already in the cache, walk the
Float32Array samples to find the first and last non-silent frame, create a new shorter AudioBuffer
via `AudioContext.createBuffer()` + `copyFromChannel()`, re-encode it to a new Blob using an
OfflineAudioContext render (WAV via MediaRecorder is not re-encodable, so the simplest approach is
to keep the trimmed AudioBuffer in memory and re-save the original blob with updated metadata — but
this means duration metadata changes, not the actual binary). The REQUIREMENTS.md explicitly calls
out that WASM-AAC re-encoding is out of scope (v2 concern). Therefore the correct implementation
approach is: trim the AudioBuffer in memory, generate a WAV/PCM blob from the trimmed buffer
using OfflineAudioContext + ScriptProcessorNode or a hand-rolled WAV encoder, replace the stored
blob in IndexedDB, and update the cached AudioBuffer. Alternatively (simpler and sufficient for
v1.1): store start/end offsets in SlotRecord and apply them via `AudioBufferSourceNode.start(when,
offset, duration)` — no re-encoding needed, no blob replacement, fully reversible. This offset
approach is what REQUIREMENTS.md gestures at ("offset-basierter Ansatz ist besser").

**Share** uses Web Share API Level 2 (`navigator.share({ files: [...] })`), available on iOS 15+.
The blob must be pre-loaded before the user gesture; `navigator.share()` itself must be called
synchronously inside the gesture handler (no async operations between the tap event and the call).
On iOS 14.x or when `canShare({ files })` returns false, fall back to a download link. In
standalone PWA mode, standard anchor `download` attribute behavior is unreliable — use
`navigator.share()` exclusively and suppress the download fallback.

**Primary recommendation:** Use AudioBuffer offset approach for trim (store `trimStartSec` /
`trimEndSec` in SlotRecord, play via `source.start(0, trimStartSec, trimDuration)`). Use
`navigator.canShare({ files })` guard before `navigator.share()`, fall back to download link only
in browser mode.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRIM-01 | App schneidet Stille vom Anfang und Ende eines Clips automatisch nach der Aufnahme ab; Nutzer erhält "Trim applied"-Feedback mit Undo-Option | AudioBuffer.getChannelData() for silence detection; offset approach avoids blob re-encoding; Undo = reset trimStart/trimEnd offsets to 0/duration |
| SHARE-01 | Nutzer kann einen Clip via iOS Share Sheet teilen oder als Datei herunterladen; Export über Long-Press-Menü erreichbar; Fallback für ältere iOS-Versionen | navigator.share({ files }) on iOS 15+; navigator.canShare({ files }) guard; standalone mode = share-only; browser mode = share + download fallback |
</phase_requirements>

---

## Standard Stack

### Core (no new dependencies)

| API / Method | Where Used | Why |
|---|---|---|
| `AudioBuffer.getChannelData()` | Silence detection | Returns `Float32Array` of PCM samples (-1.0 to 1.0) |
| `AudioContext.createBuffer()` | Trim metadata calc (sample math) | Exists in current shared AudioContext singleton |
| `AudioBufferSourceNode.start(when, offset, duration)` | Trimmed playback | Offset + duration skip silent head/tail without re-encoding |
| `navigator.share({ files })` | iOS share sheet | Web Share Level 2 — supported iOS 15+ |
| `navigator.canShare({ files })` | Feature detection | Must test before share; returns false on iOS 14 and when no share targets |
| `window.navigator.standalone` | Standalone mode detection | iOS-specific; true in Home Screen app mode |
| `window.matchMedia('(display-mode: standalone)')` | Standalone mode detection (fallback) | For non-iOS platforms; Safari 15.4+ |
| `URL.createObjectURL()` | Browser-mode download | Use with anchor `download` attribute in browser mode only |

### No New npm Packages Needed

The existing `idb-keyval` (storage), `Web Audio API` (player), and native browser APIs cover all
requirements. `audio-buffer-utils` npm package exists but is unnecessary — the silence detection
algorithm is 15 lines of vanilla JavaScript.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Offset approach (TRIM-01) | Re-encode to WAV/MP4 blob | Re-encoding needs WASM or ScriptProcessorNode; out of scope per REQUIREMENTS.md; offset is lossless, instant, reversible |
| offset approach | Store trimmed sub-buffer in IndexedDB | Increases storage complexity; blob replacement invalidates cache; offset is simpler |
| `navigator.share` | FileSaver.js | 3rd party dep; no advantage over native API; FileSaver doesn't support share sheet |

---

## Architecture Patterns

### SlotRecord Schema Extension

Add two optional fields to `SlotRecord` in `src/storage/db.ts`:

```typescript
// Source: existing pattern (color?, durationSeconds? both optional with undefined)
export interface SlotRecord {
  blob: Blob;
  mimeType: string;
  recordedAt: number;
  durationSeconds?: number;
  label?: string;
  color?: string;
  // NEW (Phase 6):
  trimStartSec?: number;   // undefined = no trim; 0 = start of audio
  trimEndSec?: number;     // undefined = no trim; equals full duration
}
```

No migration needed — `undefined` fields load cleanly from v1.0/v1.1 pre-Phase-6 records (same
pattern as `color?` in Phase 4).

### Trim Algorithm: Offset Detection via AudioBuffer

```typescript
// Source: Web Audio API MDN + Float32Array PCM conventions (HIGH confidence)
function findTrimOffsets(
  audioBuffer: AudioBuffer,
  threshold = 0.01,  // 1% of max amplitude — standard RMS silence threshold
): { startSec: number; endSec: number } {
  const { sampleRate, length, numberOfChannels } = audioBuffer;

  // Walk all channels simultaneously — silence is silence on ALL channels
  let startSample = 0;
  outer: for (let i = 0; i < length; i++) {
    for (let c = 0; c < numberOfChannels; c++) {
      if (Math.abs(audioBuffer.getChannelData(c)[i]) > threshold) {
        startSample = i;
        break outer;
      }
    }
  }

  let endSample = length - 1;
  outer2: for (let i = length - 1; i >= startSample; i--) {
    for (let c = 0; c < numberOfChannels; c++) {
      if (Math.abs(audioBuffer.getChannelData(c)[i]) > threshold) {
        endSample = i;
        break outer2;
      }
    }
  }

  // Add a small grace margin (5ms) so clipping doesn't cut the first/last word
  const GRACE_FRAMES = Math.round(sampleRate * 0.005);
  const startSec = Math.max(0, (startSample - GRACE_FRAMES)) / sampleRate;
  const endSec = Math.min(length - 1, (endSample + GRACE_FRAMES)) / sampleRate;
  return { startSec, endSec };
}
```

**Key note:** `getChannelData()` returns a live `Float32Array` view — do NOT mutate it. The function
is read-only.

### Trimmed Playback via AudioBufferSourceNode

```typescript
// Source: MDN AudioBufferSourceNode.start(when, offset, duration) (HIGH confidence)
// Existing playBlob() in src/audio/player.ts already decodes to AudioBuffer.
// After trim, play with offset so silence is skipped without re-encoding:
source.start(
  0,              // when: immediately
  trimStartSec,   // offset: skip silent start
  trimEndSec - trimStartSec,  // duration: play only trimmed portion
);
```

`playBlob()` in `player.ts` must accept optional `trimStartSec`/`trimEndSec` parameters and pass
them through to `source.start()`. The AudioBuffer cache already exists — reuse it.

### Updated durationSeconds After Trim

The duration badge (UX-02) and action sheet header use `record.durationSeconds`. After trim:

```typescript
// Recalculate and persist trimmed duration
const trimmedDuration = trimEndSec - trimStartSec;
const updatedRecord = {
  ...record,
  trimStartSec,
  trimEndSec,
  durationSeconds: Math.round(trimmedDuration),
};
await saveSlot(index, updatedRecord);
```

### Undo Trim: Reset Offsets

Undo is achieved by resetting offsets to undefined in SlotRecord:

```typescript
// Undo = restore original duration by clearing trim fields
const restoredRecord = {
  ...record,
  trimStartSec: undefined,
  trimEndSec: undefined,
  durationSeconds: record.originalDurationSeconds, // stored before trim
};
```

Store `originalDurationSeconds` (or simply re-derive from AudioBuffer.duration) so Undo can restore
the badge. The AudioBuffer is already in cache (full undecoded version) — no need to re-read IndexedDB
blob. The stored `blob` in IndexedDB is NEVER modified by trim.

**Simpler alternative:** Store `originalDurationSeconds` as a field in `SlotRecord` when trim is
first applied, and restore it on Undo. Or derive from `blob` via `decodeAudioData` on Undo (slower
but avoids extra field).

### "Trim applied" Toast Notification

Phase 6 introduces the first ephemeral notification in the app. Implement a simple toast:

```typescript
// Pattern: inject <div class="toast"> into #app, animate out after 3s
// Include an Undo button in the toast for TRIM-01 compliance
function showTrimToast(onUndo: () => void): void {
  const existing = document.querySelector('.toast');
  existing?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span>Stille entfernt</span>
    <button class="toast-undo">Rückgängig</button>
  `;
  toast.querySelector('.toast-undo')!.addEventListener('click', () => {
    toast.remove();
    onUndo();
  });
  document.getElementById('app')!.appendChild(toast);
  setTimeout(() => toast.remove(), 5000); // auto-dismiss after 5s
}
```

### Web Share: Correct Gesture Handling

**CRITICAL iOS PITFALL:** `navigator.share()` consumes transient activation. Any `await` before
calling `share()` may break gesture context on older iOS. The STATE.md already documents:
"Pre-load blob before user gesture; call `navigator.share()` synchronously (no await before it)."

```typescript
// Source: STATE.md Phase 6 constraint + MDN Navigator.share() (HIGH confidence)
// Pattern: pre-load File object from blob BEFORE user gesture, then call share() synchronously

// Step 1: In handleLongPress (after record is already in memory), pass blob to action sheet
// Step 2: Action sheet's onExport handler calls share() synchronously in the click handler

async function handleExport(index: SlotIndex): Promise<void> {
  const tile = appState.tiles[index];
  if (!tile.record) return;

  const { blob, mimeType } = tile.record;

  // Determine file extension from MIME type
  const ext = mimeType.includes('mp4') ? 'm4a'
    : mimeType.includes('webm') ? 'webm'
    : mimeType.includes('ogg') ? 'ogg'
    : 'audio';
  const fileName = `sound-${index + 1}.${ext}`;

  // Pre-create File object (does NOT require gesture — just wraps blob metadata)
  const file = new File([blob], fileName, { type: mimeType });

  // Check if running in standalone PWA mode
  const isStandalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;

  // Attempt share if supported
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    // CRITICAL: navigator.share() must be called synchronously in the click handler.
    // The blob is already in memory — no await before this point.
    try {
      await navigator.share({ files: [file], title: fileName });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        // AbortError = user cancelled — not an error
        if (!isStandalone) {
          triggerDownload(blob, fileName, mimeType);
        }
      }
    }
    return;
  }

  // Share not supported: fall back to download (browser mode only)
  if (!isStandalone) {
    triggerDownload(blob, fileName, mimeType);
  }
  // Standalone + no share support: do nothing (edge case — shouldn't happen on iOS 15+)
}

function triggerDownload(blob: Blob, fileName: string, mimeType: string): void {
  // URL.createObjectURL is unreliable in standalone mode; only call in browser mode
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

### Action Sheet: Adding Trim + Export Buttons

The existing `action-sheet.ts` + `index.html` need two new buttons (`btn-trim`, `btn-export`).
Follow the existing clone-before-wire pattern exactly:

```html
<!-- Add to #action-sheet in index.html -->
<button class="action-sheet-btn" id="btn-trim">Stille kürzen</button>
<button class="action-sheet-btn" id="btn-export">Exportieren</button>
```

`showActionSheet()` callbacks extend with `onTrim` and `onExport`.

### Recommended Project Structure (additions only)

```
src/
├── audio/
│   ├── trim.ts          # NEW: findTrimOffsets(), applyTrimToRecord()
│   ├── player.ts        # MODIFIED: playBlob() gains trimStartSec/trimEndSec params
│   ├── recorder.ts      # unchanged
│   └── format.ts        # unchanged
├── ui/
│   ├── action-sheet.ts  # MODIFIED: onTrim, onExport callbacks + btn wiring
│   ├── toast.ts         # NEW: showTrimToast() ephemeral notification
│   └── ...              # rest unchanged
├── storage/
│   └── db.ts            # MODIFIED: SlotRecord gains trimStartSec?, trimEndSec?
└── main.ts              # MODIFIED: handleTrim(), handleExport() handlers
```

### Anti-Patterns to Avoid

- **Mutating getChannelData() result:** The Float32Array is a live view of internal memory.
  Writing to it corrupts the buffer. Always read-only for detection.
- **Replacing blob in IndexedDB:** Don't replace the blob with re-encoded audio. Use offset
  approach. Blob replacement invalidates the AudioBuffer cache and risks data loss.
- **`await` before `navigator.share()`:** Any async operation before the `share()` call may
  consume the gesture budget on iOS < 17.4. Pre-load file data before the user taps.
- **`URL.createObjectURL()` in standalone mode:** Unreliable on iOS standalone PWAs — the download
  anchor may open a blank tab. Only offer download in browser mode.
- **Calling `navigator.canShare()` without checking `navigator.canShare` exists first:** The method
  itself may not exist on iOS < 15 Safari. Guard: `navigator.canShare && navigator.canShare(...)`.
- **Showing download link in standalone mode:** Requirement explicitly says "in standalone PWA mode
  the download link is suppressed." Honor this.
- **Playing `source.start(when, offset, duration)` with zero or negative duration:** Guard: if
  `trimEndSec - trimStartSec < 0.1`, skip trim (clip is nearly silent — do nothing, inform user).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Silence threshold algorithm | Complex ML VAD (Voice Activity Detection) | Simple `Math.abs(sample) > 0.01` linear scan | Voice recordings start/end with strong signal; simple amplitude scan is sufficient |
| Re-encoding trimmed audio | WASM AAC encoder | Offset approach via `source.start(offset, duration)` | REQUIREMENTS.md explicitly defers WASM encoding to v2; offset approach is instant and lossless |
| Cross-platform share detection | Complex user agent sniffing | `navigator.canShare && navigator.canShare({ files })` | This is exactly what canShare is designed for |
| Standalone PWA detection | Multiple unreliable heuristics | `window.navigator.standalone \|\| matchMedia` | Two-line check, high confidence |
| Toast notification library | External dep | 5-line vanilla DOM pattern | App has zero UI framework deps; toast is simple |

**Key insight:** The offset-based trim approach is architecturally elegant for this use case — the
original blob is preserved in IndexedDB (true lossless undo), playback skips silence via a parameter
already on `AudioBufferSourceNode.start()`, and no codec or re-encoding complexity is introduced.

---

## Common Pitfalls

### Pitfall 1: navigator.share() Called After Await

**What goes wrong:** Call `await loadSlot(index)` to fetch the blob, THEN call `navigator.share()`.
iOS < 17.4 invalidates transient activation after the first await.

**Why it happens:** The blob is in IndexedDB (async read), so developers naturally read it before sharing.

**How to avoid:** The blob is already in `appState.tiles[index].record.blob` (loaded at boot and kept
in state). Access it directly from state — no async operation needed before the share call.

**Warning signs:** "Share must be handling a user gesture" error in Safari console.

### Pitfall 2: canShare Without Checking canShare Exists

**What goes wrong:** `navigator.canShare({ files: [f] })` throws TypeError on iOS 14.x where
`canShare` doesn't exist.

**How to avoid:** Always guard: `if (navigator.canShare && navigator.canShare({ files: [file] }))`.

### Pitfall 3: Download Anchor in Standalone Mode

**What goes wrong:** `URL.createObjectURL(blob)` + `<a download>` click works in Safari browser
but does nothing (or opens blank tab) in iOS standalone PWA mode.

**Why it happens:** iOS sandboxes blob URLs differently in standalone mode context.

**How to avoid:** Check `isStandalone` before offering download. Requirements explicitly call for
suppressing download in standalone mode.

### Pitfall 4: Trim Detects Nothing (Entire Clip Is Silent)

**What goes wrong:** RMS scan finds no non-silent samples. `startSample` stays 0, `endSample`
stays at length-1, but logic inverts if the whole clip is quiet.

**How to avoid:** After computing `startSec`/`endSec`, check `endSec - startSec < 0.1`. If true,
show message "Kein Ton gefunden" and skip trim.

### Pitfall 5: clearAudioCache After Trim

**What goes wrong:** After updating `trimStartSec`/`trimEndSec` in SlotRecord, the cached
AudioBuffer is still valid (it's the full un-trimmed buffer — that's intentional). However, if
trim is re-applied to a re-recorded clip, `clearAudioCache` must be called first.

**How to avoid:** `clearAudioCache` is called in `onReRecord` already. Trim does NOT call
`clearAudioCache` — the full AudioBuffer is needed to play with new offsets.

### Pitfall 6: Undo After App Restart

**What goes wrong:** User trims, closes app, reopens, taps Undo from some persisted "undo available"
state that was never tracked.

**How to avoid:** Undo is session-only (in-memory). The toast auto-dismisses after 5s. No
cross-session undo. Document this in the toast ("Rückgängig" only available immediately after trim).
Closed toast = no undo possible. This matches iOS behavior (e.g., Voice Memo trim is also
session-only for undo).

### Pitfall 7: durationSeconds Badge Shows Pre-Trim Value After Re-record

**What goes wrong:** User re-records a tile. The new record has `durationSeconds` from the new
recording. But `trimStartSec` and `trimEndSec` from the old record may still be in state if
slotRecord isn't fully replaced.

**How to avoid:** `saveSlot` in the re-record flow already overwrites the entire record object —
`trimStartSec` and `trimEndSec` are NOT carried over. Verify this in the re-record path.

---

## Code Examples

### Silence Detection (Verified pattern — Web Audio API spec)

```typescript
// Source: Web Audio API spec (AudioBuffer.getChannelData) + standard DSP practice
// Confidence: HIGH — Float32Array PCM range [-1.0, 1.0] is spec-defined

function findTrimOffsets(
  buf: AudioBuffer,
  threshold = 0.01,
): { startSec: number; endSec: number } | null {
  const { sampleRate, length, numberOfChannels } = buf;
  let startSample = -1;
  let endSample = -1;

  // Find first non-silent sample (any channel)
  outer: for (let i = 0; i < length; i++) {
    for (let c = 0; c < numberOfChannels; c++) {
      if (Math.abs(buf.getChannelData(c)[i]!) > threshold) {
        startSample = i;
        break outer;
      }
    }
  }

  if (startSample === -1) return null; // entirely silent

  // Find last non-silent sample (any channel)
  outer2: for (let i = length - 1; i >= startSample; i--) {
    for (let c = 0; c < numberOfChannels; c++) {
      if (Math.abs(buf.getChannelData(c)[i]!) > threshold) {
        endSample = i;
        break outer2;
      }
    }
  }

  // 5ms grace margin to avoid clipping the first/last phoneme
  const grace = Math.round(sampleRate * 0.005);
  return {
    startSec: Math.max(0, startSample - grace) / sampleRate,
    endSec: Math.min(length - 1, endSample + grace) / sampleRate,
  };
}
```

### playBlob with Trim Offsets (Modified existing function)

```typescript
// Source: MDN AudioBufferSourceNode.start(when, offset, duration) — HIGH confidence
// Modification to existing src/audio/player.ts playBlob()

export async function playBlob(
  tileIndex: number,
  blob: Blob,
  onEnded: () => void,
  onStarted?: (startCtxTime: number, durationSec: number) => void,
  trimStartSec = 0,      // NEW: default 0 = no trim
  trimEndSec?: number,   // NEW: undefined = play to end
): Promise<void> {
  // ... existing decode/cache logic unchanged ...

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  // ... onended wiring unchanged ...

  const effectiveEnd = trimEndSec ?? audioBuffer.duration;
  const playDuration = effectiveEnd - trimStartSec;
  source.start(0, trimStartSec, playDuration);
  const startCtxTime = ctx.currentTime;
  // Pass trimmed duration (not full duration) to progress ring
  onStarted?.(startCtxTime, playDuration);
}
```

### Web Share with Correct Gesture Pattern

```typescript
// Source: MDN Navigator.share(), STATE.md Phase 6 constraints — HIGH confidence

// In click handler (synchronous context — no awaits before this):
function exportClip(record: SlotRecord, index: number): void {
  const ext = record.mimeType.includes('mp4') ? 'm4a'
    : record.mimeType.includes('webm') ? 'webm'
    : 'audio';
  const file = new File([record.blob], `sound-${index + 1}.${ext}`, {
    type: record.mimeType,
  });

  const isStandalone = !!(window.navigator as { standalone?: boolean }).standalone
    || window.matchMedia('(display-mode: standalone)').matches;

  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: file.name })
      .catch((err: Error) => {
        if (err.name !== 'AbortError' && !isStandalone) {
          triggerDownload(record.blob, file.name);
        }
      });
    return;
  }

  if (!isStandalone) {
    triggerDownload(record.blob, file.name);
  }
}
```

### Standalone Mode Detection

```typescript
// Source: Apple developer docs + MDN matchMedia (HIGH confidence)
// Use BOTH checks for maximum coverage

export function isStandaloneMode(): boolean {
  return !!(window.navigator as { standalone?: boolean }).standalone
    || window.matchMedia('(display-mode: standalone)').matches;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Re-encode audio to apply trim | Offset-based playback (source.start offset+duration) | Always available | No WASM, no quality loss, instant |
| Web Share Level 1 (URLs only) | Web Share Level 2 (files) on iOS 15+ | iOS 15 / Safari 15 (2021) | Audio blobs can be shared natively |
| `navigator.standalone` only | Both `navigator.standalone` + `matchMedia('display-mode: standalone')` | Safari 15.4 added matchMedia support | More reliable cross-platform detection |
| `navigator.share` requires strict gesture | iOS 17.4+ uses rate-limiting instead of strict per-gesture | iOS 17.4 (2024) | Less strict on modern iOS; still must handle older devices |

**Deprecated/outdated:**
- ScriptProcessorNode: deprecated, use AudioWorklet for real-time processing (not needed here — we do offline sample scanning, not real-time)

---

## Open Questions

1. **canShare with audio/mp4 on iOS 14.x**
   - What we know: iOS 14.x Safari doesn't support Web Share Level 2 file sharing; `navigator.canShare` may not exist
   - What's unclear: Does `navigator.canShare` exist but return false for files, or does the method not exist at all?
   - Recommendation: Guard `navigator.canShare &&` first, then call `canShare({ files })`. This handles both cases.

2. **Trim threshold calibration for iOS voice recordings**
   - What we know: iOS AAC via MediaRecorder has mild compression that may leave low-level noise at clip boundaries; threshold of 0.01 is standard
   - What's unclear: Whether iOS AAC codec produces codec noise artifacts above 0.01 threshold that would prevent silence from being detected
   - Recommendation: Use 0.01 as default, add 5ms grace margin. If trim is ineffective, user can re-apply (or threshold can be tuned upward — but keep it simple for v1.1).

3. **Share sheet app availability in standalone mode**
   - What we know: `navigator.canShare({ files })` should return true on iOS 15+ including standalone mode
   - What's unclear: Whether specific apps appear in the iOS share sheet when invoked from a standalone PWA vs browser
   - Recommendation: This is user-device-dependent (installed apps). Requirements only ask for share sheet to open — no specific app targeting needed. Must verify on device.

---

## Sources

### Primary (HIGH confidence)
- MDN Navigator.share() — user activation requirement, file types, error types, canShare()
- MDN AudioBuffer — getChannelData(), Float32Array PCM range -1.0 to 1.0, createBuffer()
- MDN AudioBufferSourceNode.start(when, offset, duration) — offset playback API
- MDN Navigator.canShare() — feature detection pattern, files property
- Existing `src/audio/player.ts` — AudioBuffer cache, single AudioContext singleton, onStarted callback pattern
- Existing `src/storage/db.ts` — SlotRecord optional field pattern (color?, label?)
- `.planning/STATE.md` Phase 6 constraints — "Pre-load blob before user gesture; call navigator.share() synchronously"

### Secondary (MEDIUM confidence)
- WebSearch: iOS 15+ Web Share Level 2 file sharing — confirmed by multiple sources
- WebSearch: `window.navigator.standalone` for iOS standalone detection — Apple documentation via search
- WebSearch: `window.matchMedia('(display-mode: standalone)')` — Safari 15.4+ support
- WebSearch: iOS 17.4 changed from strict gesture to rate-limiting for navigator.share
- WebSearch: `URL.createObjectURL()` unreliable in iOS standalone PWA mode

### Tertiary (LOW confidence)
- WebSearch: iOS 14.x specific canShare behavior — needs device verification
- WebSearch: audio/mp4 canShare return value on iOS — conflicting info; needs device test

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all Web Audio API and Web Share API capabilities are MDN-documented, and existing codebase patterns are read directly
- Architecture (trim): HIGH — offset approach is spec-defined and proven; sample scanning algorithm is standard DSP
- Architecture (share): HIGH — Web Share Level 2 pattern is MDN-documented; gesture requirement well-understood
- Pitfalls: HIGH for known iOS quirks (from STATE.md and research); MEDIUM for iOS 14 edge cases

**Research date:** 2026-02-23
**Valid until:** 2026-05-23 (Web Audio API stable; Web Share API stable on iOS 15+)
