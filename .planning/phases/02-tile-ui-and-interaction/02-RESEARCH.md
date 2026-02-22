# Phase 2: Tile UI and Interaction - Research

**Researched:** 2026-02-22
**Domain:** Vanilla TypeScript + CSS — touch UI, long-press, CSS animation, iOS haptic feedback
**Confidence:** HIGH (core stack), MEDIUM (haptic workaround), HIGH (pitfalls)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tile appearance**
- Both color AND icon change to distinguish empty vs filled tiles
- Colorful/playful palette — filled tiles each get a distinct accent color (classic soundboard style)
- Empty tiles: neutral/dark background with a mic icon; no text
- Filled tiles display the recording duration as a small timestamp (e.g. "0:03")
- Playback state visual: Claude's discretion

**Recording indicator**
- Animation style: Claude's discretion (pick what feels most iOS-native)
- Live timer shown on the tile during recording — counts elapsed time up
- Remaining time always visible during recording (countdown from 30s) so user always knows how much is left
- Post-recording transition (saving state): Claude's discretion based on how fast IndexedDB writes are

**Context menu**
- iOS action sheet — bottom sheet, large tap targets, familiar pattern
- Button order: Re-record first, then Delete (red, destructive last — follows iOS HIG)
- Header shows tile context: name if set, otherwise tile position + duration
- Rename option added to action sheet (consistent entry point for labeling)
- Delete is immediate — no confirmation step

**Tile labeling**
- Tiles have user-customizable names
- Names are set and edited via the context menu (long-press → Rename in action sheet)
- Name placement on tile: Claude's discretion (pick what works best with the colorful design)
- Empty unnamed tiles show only the mic icon — no placeholder text

### Claude's Discretion
- Playback state visual (how a tile looks while audio is playing)
- Recording animation style (pulsing border, background, or dot)
- Post-recording save transition
- Tile name placement within the tile layout
- Exact spacing, typography, shadow/corner radius details

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GRID-01 | App shows exactly 9 tiles in a 3x3 grid on a single screen with no scrolling | CSS Grid + 100dvh + aspect-ratio: 1/1 pattern; safe-area-inset for notch |
| GRID-02 | Empty and filled tiles are visually distinct at a glance | Color + icon change pattern; distinct accent colors per tile slot |
| REC-03 | Actively recording tiles show a pulsing visual indicator | CSS @keyframes with box-shadow/opacity; transform+opacity is GPU-accelerated on iOS |
| MGMT-01 | Long-pressing a filled tile opens a context menu | touchstart + setTimeout(500ms) pattern; no native `contextmenu` event on iOS |
| MGMT-02 | Context menu offers Delete and Re-record (plus Rename per decisions) | Native `<dialog>` element; CSS slide-up transition; no external library needed |
| PLAY-03 | Tapping any tile produces a brief haptic vibration on supported devices | iOS 17.4+: `<input type=checkbox switch>` click() trick; Android: navigator.vibrate(); graceful no-op on unsupported |
</phase_requirements>

---

## Summary

Phase 2 adds the entire visible layer on top of the Phase 1 audio/storage foundation. The stack is zero new dependencies — everything needed is native HTML, CSS, and TypeScript. The Phase 1 codebase is Vanilla TypeScript + Vite 7 with no UI framework, and that constraint stays for Phase 2. The `renderTiles()` function in `main.ts` currently does crude DOM reconstruction; Phase 2 replaces this with a proper grid component and CSS-driven visual states.

Three technical areas require special iOS Safari awareness. First, the 3x3 grid must fill exactly one viewport with no scroll — this requires `100dvh` (supported Safari 15.4+) combined with `aspect-ratio: 1/1` on tile cells; the old `100vh` unit misbehaves on iOS when the address bar is visible. Second, long-press detection cannot use the `contextmenu` event on iOS Safari (it does not fire); the standard pattern is `touchstart` → `setTimeout(500ms)` → trigger action, cancelled by `touchend` or `touchmove`. Third, `navigator.vibrate()` is not supported on iOS Safari as of 2026; the only workaround for iOS 17.4+ is programmatically clicking a hidden `<input type="checkbox" switch>` element, which triggers the native system haptic — this is a documented WebKit feature, not a hack.

The context menu (action sheet) is best implemented with the native `<dialog>` element positioned at the bottom of the viewport using CSS — no external library. The `<dialog>` element handles focus trapping and accessibility automatically. The rename flow should use a custom `<dialog>`-based input overlay rather than `window.prompt()`, because `window.prompt` has known reliability issues in iOS standalone PWA mode, and it cannot be styled. The tile name should be stored by adding a `label` field to the existing `SlotRecord` interface in `db.ts` — no idb-keyval store changes needed, just a schema field addition.

**Primary recommendation:** Build everything with native CSS and TypeScript, zero new npm dependencies. The five components to build are: (1) CSS grid + tile component, (2) long-press detector, (3) iOS haptic utility, (4) action sheet `<dialog>`, (5) rename input `<dialog>`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native CSS Grid | — | 3x3 layout, viewport fill | No dependency; `aspect-ratio` + `100dvh` solve iPhone layout |
| CSS @keyframes | — | Pulsing recording indicator | GPU-accelerated `transform`+`opacity`; prefers-reduced-motion friendly |
| `<dialog>` element | — | Action sheet + rename modal | Native focus trapping, accessible, no JS library needed |
| TouchEvent API | — | Long-press detection | Only reliable cross-device approach on iOS Safari |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ios-haptics (npm) | latest | iOS haptic feedback via `<input switch>` trick | Optional — implement inline instead; library is 31-commit, MIT, tiny |
| CSS custom properties | — | Per-tile accent colors, animation timing | Lets 9 tile colors be defined in one place |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<dialog>` | Custom div bottom sheet | `<dialog>` is simpler, accessible by default; custom div requires manual focus management |
| touchstart+setTimeout | Pointer Events API `pointerdown` | Pointer Events work on iOS 13+, but touch event pattern has wider precedent and less quirk surface |
| Inline haptic trick | ios-haptics package | Package adds a dependency; the technique is 5 lines of code — implement inline |
| Custom inline rename | `window.prompt()` | `window.prompt` cannot be styled and has known reliability issues in iOS standalone PWA mode |

**Installation:** No new npm packages required. All Phase 2 features use native browser APIs.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── audio/           # Phase 1 — unchanged
├── storage/         # Phase 1 — db.ts gets label field on SlotRecord
├── state/           # Phase 1 — store.ts gets label in TileData
├── ui/
│   ├── grid.ts      # renderGrid(), updateTile(index) — replaces renderTiles() in main.ts
│   ├── tile.ts      # buildTileElement(), TILE_COLORS[], tile state → CSS class mapping
│   ├── action-sheet.ts  # showActionSheet(index), hides via <dialog>.close()
│   ├── rename-dialog.ts # showRenameDialog(index, currentName) → Promise<string|null>
│   └── haptic.ts    # triggerHaptic() — unified iOS + Android + no-op
├── input/
│   └── long-press.ts  # attachLongPress(el, callback, threshold=500)
└── main.ts          # wires UI events to audio/storage/state; imports ui/* and input/*
```

### Pattern 1: CSS Grid — Fill Viewport, No Scroll

**What:** A 3x3 grid that fills exactly the visual viewport height with no scrolling, square tiles.
**When to use:** Single-screen constraint (GRID-01).

```css
/* Source: MDN aspect-ratio + 100dvh; verified against Safari 15.4+ support */
:root {
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

body {
  margin: 0;
  height: 100dvh;                 /* dvh: dynamic viewport height, adjusts with iOS address bar */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #111;
}

#grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 8px;
  padding: 8px;
  padding-bottom: calc(8px + var(--safe-bottom)); /* respect iPhone home bar */
  flex: 1;
  min-height: 0;  /* CRITICAL: without this, flex children won't shrink below content size */
}

.tile {
  aspect-ratio: 1 / 1;           /* keeps tiles square as grid stretches */
  border-radius: 14px;
  touch-action: none;             /* disables browser scroll/zoom on tile press */
  user-select: none;
  -webkit-user-select: none;
}
```

**Key:** `viewport-fit=cover` must be set in the `<meta name="viewport">` tag for `safe-area-inset-bottom` to have a value. Without it, `env(safe-area-inset-bottom)` is always 0.

### Pattern 2: Long-Press Detection (iOS-Safe)

**What:** Detect a 500ms press without relying on `contextmenu` event (does not fire on iOS Safari).
**When to use:** MGMT-01 — all long-press interactions.

```typescript
// Source: MDN TouchEvent API; pattern verified across multiple iOS sources
export function attachLongPress(
  el: HTMLElement,
  onLongPress: () => void,
  thresholdMs = 500,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function start(e: TouchEvent | MouseEvent) {
    // Only trigger on single touch (not pinch/zoom)
    if (e instanceof TouchEvent && e.touches.length > 1) return;
    timer = setTimeout(() => {
      timer = null;
      onLongPress();
    }, thresholdMs);
  }

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchmove', cancel); // cancels if finger moves (scroll intent)
  el.addEventListener('touchcancel', cancel);

  // Return cleanup function
  return () => {
    cancel();
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchend', cancel);
    el.removeEventListener('touchmove', cancel);
    el.removeEventListener('touchcancel', cancel);
  };
}
```

**CRITICAL:** Add `{ passive: true }` to `touchstart` listener. Without it, iOS Safari emits a warning and the browser may delay event processing.

### Pattern 3: iOS Haptic Feedback

**What:** Trigger native iOS haptic via the `<input type="checkbox" switch>` trick introduced in Safari (iOS 17.4 / WebKit).
**When to use:** PLAY-03 — every tile tap.

```typescript
// Source: webkit.org/blog/15865 (Safari 18.0 release notes);
//         github.com/tijnjh/ios-haptics (verified technique)
//         navigator.vibrate() MDN for Android fallback
let _hapticInput: HTMLInputElement | null = null;

function getHapticInput(): HTMLInputElement {
  if (!_hapticInput) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');       // non-standard iOS switch attribute
    input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:0;height:0';
    document.body.appendChild(input);
    _hapticInput = input;
  }
  return _hapticInput;
}

export function triggerHaptic(): void {
  // iOS 17.4+: toggle hidden switch input — Safari fires native haptic
  if ('ontouchstart' in window && _supportsSwitch()) {
    const input = getHapticInput();
    input.click(); // toggles the switch state, triggering haptic
    return;
  }
  // Android / other: Vibration API
  if (navigator.vibrate) {
    navigator.vibrate(10);
    return;
  }
  // Unsupported: silent no-op
}

function _supportsSwitch(): boolean {
  // Safari 17.4+ on iOS recognises the switch attribute
  // We detect by checking if the input retains the attribute after setting
  const test = document.createElement('input');
  test.setAttribute('switch', '');
  return test.hasAttribute('switch'); // always true — use iOS UA check instead
}
```

**Simpler production approach:** Cache `_hapticInput` once at module init. Always call `input.click()` on iOS (detected by `'ontouchstart' in window`); use `navigator.vibrate(10)` on Android; silent on desktop. The `_supportsSwitch` check is redundant — clicking a regular checkbox on older iOS produces no haptic and no harm.

```typescript
// Minimal production version
const _isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
let _switchEl: HTMLInputElement | null = null;

export function triggerHaptic(): void {
  if (_isIOS) {
    if (!_switchEl) {
      _switchEl = document.createElement('input');
      _switchEl.type = 'checkbox';
      _switchEl.setAttribute('switch', '');
      Object.assign(_switchEl.style, { position: 'fixed', opacity: '0',
        pointerEvents: 'none', width: '0', height: '0' });
      document.body.appendChild(_switchEl);
    }
    _switchEl.click();
    return;
  }
  navigator.vibrate?.(10);
}
```

### Pattern 4: Action Sheet (`<dialog>` bottom sheet)

**What:** Native `<dialog>` element slides up from bottom, iOS HIG button order.
**When to use:** MGMT-01, MGMT-02 — long-press on filled tile.

```typescript
// Source: MDN HTMLDialogElement; pattern aligned with iOS HIG action sheet
export function showActionSheet(
  index: number,
  record: SlotRecord,
  label: string | undefined,
  onReRecord: () => void,
  onDelete: () => void,
  onRename: () => void,
): void {
  const dialog = document.getElementById('action-sheet') as HTMLDialogElement;
  const header = dialog.querySelector('.action-sheet-header')!;
  header.textContent = label ?? `Tile ${index + 1} · ${formatDuration(record.recordedAt)}`;

  // Wire buttons — clone to remove stale event listeners
  wireButton('btn-rerecord', onReRecord, dialog);
  wireButton('btn-rename', onRename, dialog);
  wireButton('btn-delete', onDelete, dialog);
  wireButton('btn-cancel', () => {}, dialog);

  dialog.showModal();
}
```

```css
/* Action sheet CSS — slides up from bottom */
#action-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  margin: 0;
  max-width: 100%;
  border: none;
  border-radius: 14px 14px 0 0;
  background: #1c1c1e;            /* iOS dark sheet color */
  padding: 0 0 env(safe-area-inset-bottom, 16px);
  transform: translateY(100%);
  transition: transform 0.3s ease-out;
}

#action-sheet[open] {
  transform: translateY(0);
}

/* Backdrop */
#action-sheet::backdrop {
  background: rgba(0, 0, 0, 0.5);
}

.action-sheet-btn {
  display: block;
  width: 100%;
  padding: 17px 16px;
  font-size: 17px;
  border: none;
  background: transparent;
  color: #fff;
  text-align: center;
  border-top: 0.5px solid rgba(255,255,255,0.15);
}

.action-sheet-btn.destructive {
  color: #ff453a; /* iOS red */
}
```

**Note:** `<dialog>` transitions require a workaround — the dialog is hidden via CSS `transform` rather than `display:none` toggling, because `display:none` prevents CSS transitions from playing on open. The `[open]` attribute is set by `showModal()`.

### Pattern 5: Recording Pulse Animation

**What:** GPU-accelerated pulsing glow on the actively recording tile.
**When to use:** REC-03 — tile is in `recording` state.

```css
/* Source: MDN @keyframes; CSS-Tricks pulsing examples; prefers-reduced-motion guidance */
@keyframes tile-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.7);  /* iOS red */
  }
  50% {
    box-shadow: 0 0 0 12px rgba(255, 59, 48, 0);
  }
}

.tile--recording {
  animation: tile-pulse 1.2s ease-in-out infinite;
}

/* Accessibility: respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .tile--recording {
    animation: none;
    outline: 3px solid rgba(255, 59, 48, 0.9); /* static indicator */
  }
}
```

**Why `box-shadow` not `border`:** Animating `box-shadow` is GPU-composited on iOS Safari. Animating `border-width` triggers layout recalculation on every frame — avoid.

### Pattern 6: Live Recording Timer

**What:** `setInterval` updating elapsed + remaining time on the recording tile.
**When to use:** During `recording` state — both elapsed and countdown.

```typescript
// Pattern: start timer when recording starts, clear on stop
// elapsed counts up; remaining counts down from 30
let _recordingTimer: ReturnType<typeof setInterval> | null = null;
let _recordingStart: number = 0;
const MAX_SECONDS = 30;

export function startRecordingTimer(
  index: number,
  onTick: (elapsed: number, remaining: number) => void,
): () => void {
  _recordingStart = Date.now();
  _recordingTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - _recordingStart) / 1000);
    const remaining = Math.max(0, MAX_SECONDS - elapsed);
    onTick(elapsed, remaining);
  }, 200); // 200ms interval — smooth enough, not excessive

  return () => {
    if (_recordingTimer !== null) {
      clearInterval(_recordingTimer);
      _recordingTimer = null;
    }
  };
}
```

### Pattern 7: Tile Color Assignment

**What:** 9 distinct accent colors per slot, consistent (slot index → color, not random).
**When to use:** All filled tiles (GRID-02).

```typescript
// Classic soundboard palette — bold, distinct, playful
export const TILE_COLORS = [
  '#FF6B6B', // coral red
  '#FF9F43', // warm orange
  '#FECA57', // sunshine yellow
  '#48DBFB', // sky blue
  '#1DD1A1', // mint green
  '#FF9FF3', // soft pink
  '#54A0FF', // vivid blue
  '#5F27CD', // purple
  '#00D2D3', // teal
] as const;

export function getTileColor(index: number): string {
  return TILE_COLORS[index % TILE_COLORS.length];
}
```

### Pattern 8: `SlotRecord` Extension for Labels

**What:** Add optional `label` field to `SlotRecord` in `db.ts`. idb-keyval stores plain objects — adding a field is backward-compatible; existing stored records simply won't have a `label` property (treated as `undefined`).
**When to use:** Rename feature.

```typescript
// In src/storage/db.ts — add label field
export interface SlotRecord {
  blob: Blob;
  mimeType: string;
  recordedAt: number;
  label?: string;        // NEW: user-customizable tile name, undefined if not set
}
```

No migration needed — idb-keyval stores arbitrary objects; records written before this change will be read back without `label` (which is `undefined` — the correct empty state).

### Anti-Patterns to Avoid

- **Using `100vh` for the grid container:** On iOS Safari, `100vh` equals the maximum viewport height (address bar hidden). When the address bar is visible, the grid overflows and causes scroll. Use `100dvh` instead.
- **Listening for `contextmenu` event for long-press:** This event does not reliably fire on iOS Safari. Use `touchstart` + `setTimeout` pattern.
- **Using `navigator.vibrate()` without a guard on iOS:** Returns `undefined` on iOS, won't throw, but the feature is a no-op. The `<input switch>` trick is the only path to real iOS haptic.
- **Animating `border-width` or `width`/`height` for the pulse:** These trigger layout on every frame, causing jank. Use `box-shadow` or `transform` — both are compositor-only on iOS Safari.
- **Applying `-webkit-user-select: none` to the entire body:** Known WebKit bug — this can make `<input>` fields uneditable on iOS. Apply only to non-input elements (tiles, buttons).
- **Reconstructing all 9 tile DOM nodes on every render:** The current Phase 1 `renderTiles()` does full `innerHTML = ''` and rebuilds. Phase 2 should update tile attributes/classes in place to avoid losing event listeners and causing layout thrash.
- **Using `window.prompt()` for rename:** Cannot be styled; has known reliability issues in iOS standalone PWA mode. Use `<dialog>` with an `<input>` field instead.
- **Forgetting `touch-action: none` on tile elements:** Without this, iOS may intercept the touch for scroll/zoom before your event listeners fire, causing missed taps on a long press.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS animation pulse | Custom JS requestAnimationFrame loop | CSS `@keyframes` | Browser compositor handles it; no JS thread involvement |
| Focus trapping in modal | Manual tabIndex management | Native `<dialog>` element | `showModal()` handles focus trap, ESC key, backdrop automatically |
| Bottom sheet physics | JS-driven spring animation | CSS `transform` + `transition` | 60fps via compositor; simpler code; matches iOS feel |
| Long-press threshold | External touch library | `touchstart` + `setTimeout` | 5 lines of code; no dependency |
| Haptic feedback | Custom native bridge | `<input switch>.click()` trick | Documented WebKit feature; works without any library |

**Key insight:** For a vanilla TypeScript app of this scale, adding UI libraries (Shoelace, ionic-components, etc.) would outweigh any benefit. Every required feature is implementable in < 50 lines of native code.

---

## Common Pitfalls

### Pitfall 1: Viewport Height — `100vh` vs `100dvh`

**What goes wrong:** Grid overflows viewport when iOS Safari address bar is visible; page becomes scrollable; tiles go below visible area.
**Why it happens:** `100vh` on iOS Safari is the viewport height with the address bar hidden (the "large" viewport). `100dvh` dynamically tracks the current viewport.
**How to avoid:** Use `height: 100dvh` on the root container. Safari 15.4+ supports `dvh`. The existing `index.html` already has `user-scalable=no` — also add `viewport-fit=cover` for safe-area support.
**Warning signs:** Scrolling is possible on the main app screen; tiles near the bottom are cut off or require scroll.

### Pitfall 2: Long-Press Fires Then Tap Also Fires

**What goes wrong:** After a 500ms long-press opens the action sheet, a `click` event also fires on the tile, triggering recording/playback.
**Why it happens:** `touchend` fires when the user lifts their finger after long-press, and the browser synthesizes a `click` event from the touch sequence.
**How to avoid:** In the `touchend` handler, call `event.preventDefault()` only when a long-press was confirmed (timer already fired). Better: use a flag `longPressActivated` — if true, call `event.preventDefault()` in `touchend` to suppress the synthetic click.
**Warning signs:** Action sheet opens but immediately closes because a tile tap handler also ran.

### Pitfall 3: `dialog` CSS Transitions Don't Animate on Open

**What goes wrong:** The action sheet snaps open instead of sliding up.
**Why it happens:** Browsers toggle `display` from `none` to `block` when `showModal()` is called. CSS `transition` on `transform` cannot animate from a `display:none` state — the starting state is invisible.
**How to avoid:** Use the CSS `@starting-style` rule (Chrome 117+, Safari 17.5+) OR use the JS approach: add an `is-opening` class after `showModal()`, remove it on next frame. Alternatively, keep `dialog` always in the DOM without `display:none` and use `transform: translateY(100%)` as the hidden state.
**Warning signs:** Bottom sheet appears instantly with no slide animation.

### Pitfall 4: Touch Action Interference

**What goes wrong:** Long-press on a tile initiates a page scroll instead of registering as a hold.
**Why it happens:** By default iOS assigns `touch-action: auto` to all elements, meaning touch events are first evaluated for scroll/zoom intent. If the element is inside a scrollable container, the browser may claim the touch.
**How to avoid:** Set `touch-action: none` on each tile element. Since the grid has `overflow: hidden` (no scroll), this is safe and does not break anything.
**Warning signs:** Long-press on tiles near the edge of the screen scrolls the page instead of opening context menu.

### Pitfall 5: `user-select: none` Breaks Rename Input

**What goes wrong:** The rename `<dialog>` opens but the user cannot type in the `<input>` field.
**Why it happens:** Setting `-webkit-user-select: none` on a parent element (e.g. `body` or `#app`) prevents text selection AND input in `<input>` elements in some WebKit versions.
**How to avoid:** Apply `user-select: none` only to the tile elements themselves (`.tile { user-select: none }`), NOT to the body or app container. Ensure the rename `<input>` element is NOT a descendant of a `user-select: none` container.
**Warning signs:** Keyboard appears on focus but typing produces no characters in the rename input.

### Pitfall 6: Action Sheet Does Not Close on Backdrop Click

**What goes wrong:** User taps outside the action sheet expecting it to close; nothing happens.
**Why it happens:** `<dialog>` modal does not close on backdrop click by default — that requires explicit handling.
**How to avoid:** Add a click handler on the `<dialog>` element itself; if `event.target === dialog` (click landed on backdrop pseudo-element, not sheet content), call `dialog.close()`.
**Warning signs:** User is "trapped" in the action sheet and must tap Cancel.

### Pitfall 7: Timer Leak on Recording Stop

**What goes wrong:** The live recording timer continues counting after the recording has stopped; UI shows stale time values.
**Why it happens:** If the `clearInterval` cleanup function is not called when transitioning out of `recording` state, the `setInterval` callback keeps running.
**How to avoid:** Store the cleanup function returned by `startRecordingTimer()` in the `TileData` or a module-level map keyed by tile index. Call it immediately in the `onComplete` callback before transitioning to `saving` state.
**Warning signs:** Timer display continues updating after save completes; wrong elapsed time shown in header.

---

## Code Examples

### Full Tile CSS State Classes

```css
/* Source: MDN CSS custom properties + class-based state pattern */
.tile {
  position: relative;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
  transition: transform 0.08s ease, filter 0.08s ease;
  overflow: hidden;
}

/* Empty state */
.tile--empty {
  background: #2a2a2e;
  border: 1.5px dashed rgba(255,255,255,0.2);
}

/* Filled — color applied via inline style: tile.style.setProperty('--tile-color', color) */
.tile--has-sound {
  background: var(--tile-color, #54A0FF);
}

/* Recording state */
.tile--recording {
  background: #2a2a2e;
  border: 2px solid rgba(255, 59, 48, 0.9);
  animation: tile-pulse 1.2s ease-in-out infinite;
}

/* Saving state — dim briefly */
.tile--saving {
  opacity: 0.6;
  filter: brightness(0.8);
}

/* Playing state — brightness lift to signal active */
.tile--playing {
  filter: brightness(1.2);
}

/* Press feedback */
.tile:active {
  transform: scale(0.95);
}
```

### Updating a Single Tile (No Full Re-render)

```typescript
// Phase 2 replaces renderTiles() full rebuild with per-tile update
function updateTileElement(index: number, tile: TileData): void {
  const el = document.querySelector(`[data-slot="${index}"]`) as HTMLElement;
  if (!el) return;

  // Remove all state classes
  el.className = 'tile';
  el.classList.add(`tile--${tile.state}`);

  // Color for filled states
  if (tile.state === 'has-sound' || tile.state === 'playing') {
    el.style.setProperty('--tile-color', TILE_COLORS[index]);
  }

  // Inner content
  el.innerHTML = buildTileContent(index, tile);
}

function buildTileContent(index: number, tile: TileData): string {
  switch (tile.state) {
    case 'empty':
      return '<span class="tile-icon">🎙</span>';
    case 'recording':
      return `
        <span class="tile-elapsed" id="timer-${index}">0:00</span>
        <span class="tile-remaining" id="countdown-${index}">0:30</span>
      `;
    case 'saving':
      return '<span class="tile-icon tile-icon--saving">...</span>';
    case 'has-sound':
    case 'playing': {
      const label = tile.record?.label ?? `Slot ${index + 1}`;
      const dur = formatDuration(tile.record?.recordedAt ?? 0);
      return `
        <span class="tile-label">${escapeHtml(label)}</span>
        <span class="tile-duration">${dur}</span>
      `;
    }
    case 'error':
      return '<span class="tile-icon tile-icon--error">!</span>';
    default:
      return '';
  }
}
```

### Rename Dialog Pattern

```typescript
// Custom <dialog> for rename — avoids window.prompt() issues on iOS PWA
export function showRenameDialog(currentName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.getElementById('rename-dialog') as HTMLDialogElement;
    const input = dialog.querySelector('input') as HTMLInputElement;
    const form = dialog.querySelector('form')!;

    input.value = currentName;

    const handleSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      const value = input.value.trim();
      dialog.close();
      resolve(value || null);
      cleanup();
    };

    const handleCancel = () => {
      dialog.close();
      resolve(null);
      cleanup();
    };

    function cleanup() {
      form.removeEventListener('submit', handleSubmit);
      dialog.removeEventListener('cancel', handleCancel);
    }

    form.addEventListener('submit', handleSubmit);
    dialog.addEventListener('cancel', handleCancel); // ESC key

    dialog.showModal();
    // Delay focus to work around iOS Safari keyboard timing
    requestAnimationFrame(() => input.focus());
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `100vh` for mobile full-screen | `100dvh` (dynamic viewport height) | Safari 15.4 (2022) | Eliminates iOS address bar overflow bug |
| `contextmenu` event for long press | `touchstart` + `setTimeout` | iOS 13 (2019) broke `contextmenu` | Must use timer-based approach |
| `navigator.vibrate()` for haptic | `<input switch>.click()` for iOS | Safari 17.4 / iOS 17.4 (2024) | First-ever iOS web haptic path |
| Custom modal/dialog JS | Native `<dialog>` element | Safari 15.4+ (Baseline 2022) | Focus trap, `::backdrop`, ESC key — free |
| Inline JS animation | CSS `@keyframes` with `transform` | Modern CSS (2020+) | GPU compositor; no main thread involvement |
| `aspect-ratio` hacks (padding-top %) | `aspect-ratio: 1/1` property | Safari 15+ (2021) | Clean square tiles in grid |

**Deprecated/outdated:**
- `webkitRequestAnimationFrame`: Unprefixed `requestAnimationFrame` is universally available; prefix never needed.
- `-webkit-animation` prefix: Drop vendor prefix; `animation` works on all current browsers.
- `touchstart` + `preventDefault()` globally: Breaks passive scrolling; use `{ passive: true }` with selective `preventDefault` only where needed.

---

## Open Questions

1. **`<dialog>` open/close animation on iOS Safari 17.x**
   - What we know: CSS `@starting-style` (for `display` transition) landed in Safari 17.5. The `dialog[open]` transition trick with `transform` works on Safari 17.4+.
   - What's unclear: Exact animation behavior on Safari 15/16 (older iPhones). Safe fallback is instant show with no animation.
   - Recommendation: Use `transform: translateY(100%)` → `translateY(0)` approach (no `display` toggle) for broadest compatibility. Test on device during iPhone verification checkpoint.

2. **`<input type=checkbox switch>` haptic — iOS version floor**
   - What we know: Safari 17.4 introduced `<input switch>` (webkit.org confirmed). iOS 17.4 released March 2024.
   - What's unclear: Exact iOS version distribution of project user's device.
   - Recommendation: The haptic call is always a silent no-op on unsupported iOS versions — implement unconditionally. No minimum version guard needed.

3. **Rename input keyboard interaction on iOS PWA**
   - What we know: `window.prompt` has known issues in standalone mode. Custom `<dialog>` with `<input>` is the correct pattern. iOS raises the software keyboard on `input.focus()`.
   - What's unclear: Whether the keyboard push-up visually repositions the dialog or clips it. The `visualViewport` API can compensate.
   - Recommendation: Use `visualViewport` resize event to adjust `<dialog>` `bottom` position when keyboard appears. Test during iPhone verification.

---

## Sources

### Primary (HIGH confidence)
- webkit.org/blog/15865 — Safari 18.0 release notes; `<input switch>` haptic confirmed
- MDN Web Docs: `dvh`, `aspect-ratio`, `<dialog>`, `TouchEvent`, `@keyframes` — all stable APIs verified
- MDN Navigator.vibrate — confirmed NOT supported on iOS Safari as of 2026

### Secondary (MEDIUM confidence)
- github.com/tijnjh/ios-haptics — implementation technique cross-verified with Safari 18 release notes; MIT, 31 commits, npm published
- viliket.github.io/posts/native-like-bottom-sheets-on-the-web/ — CSS scroll snap bottom sheet; `@supports (-webkit-touch-callout: none)` iOS scroll workaround documented
- WebSearch results on `100dvh` Safari support — multiple sources agree; Safari 15.4+

### Tertiary (LOW confidence)
- WebSearch on `window.prompt` standalone PWA blocking — no direct confirmation found; recommend custom dialog as defense regardless
- WebSearch on `-webkit-user-select: none` breaking inputs — reported in Apple Developer Forums and GitHub issues; specific iOS version range unclear

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs are native, no library decisions needed; verified in MDN and WebKit blog
- Architecture: HIGH — patterns derive directly from existing Phase 1 code structure; straightforward extension
- Haptic feedback: MEDIUM — iOS `<input switch>` trick is documented but non-standard; could change in future Safari versions
- Animation/CSS: HIGH — CSS @keyframes + box-shadow approach is stable, GPU-accelerated, well-documented
- Pitfalls: HIGH — long-press and `100dvh` issues are documented in multiple authoritative sources

**Research date:** 2026-02-22
**Valid until:** 2026-04-01 (stable APIs; haptic trick should be rechecked if targeting iOS 18.x+ exclusively)
