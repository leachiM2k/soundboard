# Phase 4: Foundation - Research

**Researched:** 2026-02-23
**Domain:** Vanilla TypeScript PWA — dialog UX, IndexedDB schema extension, tile rendering
**Confidence:** HIGH

## Summary

Phase 4 is the lowest-risk phase of v1.1. All three requirements (UX-01, UX-02, COLOR-01) operate entirely on already-proven patterns in the v1.0 codebase. No new browser APIs are required, no iOS-specific verification risks exist, and no new npm packages are needed. The work is additive: extend `SlotRecord` and `TileData` with an optional `color` field, create one new `confirm-dialog.ts` module following the existing `rename-dialog.ts` pattern, fix the `playing` state's missing duration badge in `tile.ts`, and add a color-picker row to the action sheet.

The three features share a single schema dependency: `SlotRecord.color` must be added before the tile renderer and action sheet color UI can reference it. Because the field is optional (`color?: string`) and idb-keyval stores plain objects with no schema enforcement, existing v1.0 records load without any migration — every consumer just uses `record.color ?? defaultValue`. This optional-field discipline is already established in the codebase via `durationSeconds?: number`.

The confirm dialog is a near-copy of `rename-dialog.ts`. The duration badge fix is a one-liner in `buildTileContent`. The color picker is the most involved change — it adds a swatch row to the action sheet HTML, a new `onColorChange` callback, and a `handleColorChange` handler in `main.ts` — but each piece is straightforward. The recommended build order is: schema first, then confirm dialog, then duration badge, then tile color. This order ensures every feature reads from a complete data model from day one.

**Primary recommendation:** Land the schema changes (`color?` on `SlotRecord` and `TileData`, color preservation in `transitionTile`) as the very first commit; all subsequent Phase 4 tasks depend on it.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UX-01 | User sees a confirmation dialog before a clip is deleted | `<dialog>` pattern proven in rename-dialog.ts; new `confirm-dialog.ts` module; action-sheet wraps existing `onDelete` callback with async confirm step |
| UX-02 | Every occupied tile shows a clip-duration badge (e.g., "2.4s") in both has-sound and playing states | `durationSeconds` already in `SlotRecord`; `formatDuration()` already in `tile.ts`; `has-sound` branch already renders badge; `playing` branch is the only gap — one-line fix |
| COLOR-01 | User can pick one of 8 preset colors via long-press menu; color persists after app restart; v1.0 records without color load without errors | Optional `color?: string` field on `SlotRecord` + `TileData`; preset swatch row in action sheet; CSS custom property `--tile-color` already wired; `CSS.supports()` guard on read |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.8.3 | All new code typed inline | Already in use; no version change needed |
| idb-keyval | 6.2.2 | `SlotRecord` persistence | Already in use; optional fields stored transparently; no migration API needed |
| Web `<dialog>` element | Browser-native | Confirm dialog for UX-01 | Proven in production by `rename-dialog.ts`; handles focus trap, `showModal()`, backdrop; no iOS-specific issues |
| CSS custom properties | Browser-native | Per-tile color via `--tile-color` | Already implemented in `applyTileState`; extend only |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `CSS.supports()` | Browser-native | Validate stored color strings before applying to DOM | When reading `SlotRecord.color` in `applyTileState` — prevents silent CSS no-ops from tampered storage |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Preset color swatches (8 `<button>`) | `<input type="color">` native picker | Native picker on iOS 17+ opens a large modal wheel — jarring UX that doesn't fit the bold minimal aesthetic; preset swatches cover 90% of use cases immediately |
| `<dialog>` element for confirm | Custom overlay div | `<dialog>` provides focus trap and ARIA role natively; custom overlay needs manual focus management; `<dialog>` proven to work in iOS Safari standalone PWA in this codebase already |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── storage/
│   └── db.ts              # MODIFY: add color?: string to SlotRecord
├── state/
│   └── store.ts           # MODIFY: add color?: string to TileData; transitionTile preserves color
├── ui/
│   ├── confirm-dialog.ts  # NEW: showConfirmDialog(message): Promise<boolean>
│   ├── action-sheet.ts    # MODIFY: onColorChange callback + color swatch row
│   └── tile.ts            # MODIFY: duration badge in playing branch; user color in applyTileState
├── main.ts                # MODIFY: handleColorChange; onDelete wrapped with confirm dialog
└── style.css              # MODIFY: confirm dialog styles; color swatch row styles
index.html                 # MODIFY: add confirm dialog markup + color swatch HTML in action sheet
```

### Pattern 1: Optional Field on SlotRecord (Backward Compatibility)

**What:** Add `color?: string` as an optional field to `SlotRecord` and `TileData`. idb-keyval stores plain objects — existing records simply won't have the field. Every reader uses a nullish coalescing fallback.

**When to use:** Any time a new per-slot datum is introduced. This is the established pattern (`durationSeconds?`, `label?`).

**Example:**

```typescript
// storage/db.ts — extend SlotRecord
export interface SlotRecord {
  blob: Blob;
  mimeType: string;
  recordedAt: number;
  durationSeconds?: number;
  label?: string;
  color?: string;  // NEW: user-chosen CSS color. undefined = use index-based default
}

// state/store.ts — extend TileData
export interface TileData {
  state: TileState;
  activeRecording?: ActiveRecording;
  record?: SlotRecord;
  errorMessage?: string;
  warningActive?: boolean;
  label?: string;
  color?: string;  // NEW: synced from SlotRecord.color
}
```

### Pattern 2: transitionTile Color Preservation

**What:** `transitionTile` in `store.ts` must forward `color` in `has-sound` and `playing` branches, the same way it already forwards `label`.

**When to use:** Whenever a persistent user preference (label, color) must survive state transitions.

**Example:**

```typescript
// state/store.ts — updated has-sound / playing branch
} else if (newState === 'has-sound' || newState === 'playing') {
  next.record = data.record ?? tile.record;
  next.label  = data.label  ?? tile.label;
  next.color  = data.color  ?? tile.color;  // ADD THIS LINE
}
```

### Pattern 3: confirm-dialog.ts — Clone-Before-Wire

**What:** New `src/ui/confirm-dialog.ts` exports `showConfirmDialog(message: string): Promise<boolean>`. Follows the exact same clone-before-wire pattern as `rename-dialog.ts` to prevent stale listener accumulation on repeated opens.

**When to use:** Any destructive action that needs async confirmation. The pattern is: close the action sheet first, then open the confirm dialog, then await the result.

**Example:**

```typescript
// src/ui/confirm-dialog.ts
export function showConfirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirm-dialog') as HTMLDialogElement;
    const msgEl = document.getElementById('confirm-dialog-message');
    if (msgEl) msgEl.textContent = message;

    // Clone buttons to drop stale listeners (same pattern as rename-dialog.ts)
    const btnConfirm = document.getElementById('confirm-dialog-confirm');
    const btnCancel  = document.getElementById('confirm-dialog-cancel');
    if (!btnConfirm || !btnCancel) { resolve(false); return; }

    const cloneConfirm = btnConfirm.cloneNode(true) as HTMLButtonElement;
    const cloneCancel  = btnCancel.cloneNode(true)  as HTMLButtonElement;
    btnConfirm.replaceWith(cloneConfirm);
    btnCancel.replaceWith(cloneCancel);

    cloneConfirm.addEventListener('click', () => { dialog.close(); resolve(true); });
    cloneCancel.addEventListener('click',  () => { dialog.close(); resolve(false); });

    dialog.addEventListener('close', () => resolve(false), { once: true });
    dialog.showModal();
  });
}
```

```html
<!-- index.html — new confirm dialog markup -->
<dialog id="confirm-dialog" aria-modal="true">
  <div class="confirm-dialog-content">
    <p class="confirm-dialog-message" id="confirm-dialog-message"></p>
    <div class="confirm-dialog-actions">
      <button id="confirm-dialog-cancel">Abbrechen</button>
      <button id="confirm-dialog-confirm" class="destructive">Löschen</button>
    </div>
  </div>
</dialog>
```

### Pattern 4: Delete Confirmation Wire-Up in action-sheet.ts

**What:** The existing `wireBtn('btn-delete', callbacks.onDelete)` call is replaced with a version that: closes the action sheet, opens the confirm dialog, and only calls `callbacks.onDelete()` if the user confirms.

**Important sequencing constraint:** iOS cannot show two `<dialog>` elements simultaneously. The action sheet dialog MUST be closed before `showConfirmDialog()` is called. The existing `wireBtn` helper already calls `dialog.close()` before calling the handler — this close call precedes the async confirm dialog open, so the sequencing is correct.

**Example:**

```typescript
// action-sheet.ts — wrap delete with confirm
wireBtn('btn-delete', () => {
  // dialog.close() already called by wireBtn before this handler runs
  showConfirmDialog('Sound löschen?').then((confirmed) => {
    if (confirmed) callbacks.onDelete();
  });
});
```

### Pattern 5: Duration Badge in playing State

**What:** The `playing` branch of `buildTileContent` in `tile.ts` currently renders the label but not the duration badge. The `has-sound` branch already has the correct pattern.

**Example (current gap):**

```typescript
// tile.ts — current playing branch (missing duration badge)
case 'playing': {
  const label = tile.label ?? `Slot ${index + 1}`;
  return `
    <span class="tile-icon">▶</span>
    <span class="tile-label">${escapeHtml(label)}</span>
  `;  // ← duration badge missing here
}
```

**Fix:**

```typescript
case 'playing': {
  const label = tile.label ?? `Slot ${index + 1}`;
  const dur = tile.record?.durationSeconds != null
    ? `<span class="tile-duration">${formatDuration(tile.record.durationSeconds)}</span>`
    : '';
  return `
    <span class="tile-icon">▶</span>
    <span class="tile-label">${escapeHtml(label)}</span>
    ${dur}
  `;
}
```

### Pattern 6: Color Application in applyTileState

**What:** `applyTileState` in `tile.ts` currently always calls `getTileColor(index)` for filled tiles. Update to prefer `tile.color` when set, with `CSS.supports()` validation.

**Example:**

```typescript
// tile.ts — updated applyTileState color logic
if (tile.state === 'has-sound' || tile.state === 'playing') {
  const raw = tile.color;
  const validated = raw && CSS.supports('color', raw) ? raw : null;
  el.style.setProperty('--tile-color', validated ?? getTileColor(index));
} else {
  el.style.removeProperty('--tile-color');
}
```

### Pattern 7: Color Swatch Row in Action Sheet

**What:** A horizontal row of 8 `<button>` elements, each with an inline `background-color`, added above the Cancel button in the action sheet. Wired via a new `onColorChange(color: string | undefined): void` callback on `ActionSheetCallbacks`.

**Preset palette:** Reuse the existing `TILE_COLORS` array from `tile.ts` (9 colors — pick 8 or expose all 9 plus a "reset" swatch).

**Example HTML:**

```html
<!-- index.html — inside .action-sheet-content, before btn-cancel -->
<div class="action-sheet-colors" id="action-sheet-colors">
  <!-- Populated dynamically by action-sheet.ts to reuse TILE_COLORS -->
</div>
```

**Example wiring in action-sheet.ts:**

```typescript
// Render swatch row dynamically from TILE_COLORS
import { TILE_COLORS } from './tile';

const swatchRow = document.getElementById('action-sheet-colors');
if (swatchRow) {
  swatchRow.innerHTML = '';
  // Reset swatch
  const resetBtn = document.createElement('button');
  resetBtn.className = 'color-swatch color-swatch--reset';
  resetBtn.title = 'Farbe zurücksetzen';
  resetBtn.addEventListener('click', () => {
    dialog.close();
    callbacks.onColorChange(undefined);
  });
  swatchRow.appendChild(resetBtn);
  // Preset swatches
  TILE_COLORS.forEach((color) => {
    const btn = document.createElement('button');
    btn.className = 'color-swatch';
    btn.style.background = color;
    btn.addEventListener('click', () => {
      dialog.close();
      callbacks.onColorChange(color);
    });
    swatchRow.appendChild(btn);
  });
}
```

**handleColorChange in main.ts:**

```typescript
async function handleColorChange(index: SlotIndex, color: string | undefined): Promise<void> {
  const record = await loadSlot(index);
  if (!record) return;
  await saveSlot(index, { ...record, color });
  const tile = appState.tiles[index];
  tile.color = color;
  updateTile(index, tile);
}
```

### Anti-Patterns to Avoid

- **Opening confirm dialog while action sheet is still open:** iOS cannot display two `showModal()` dialogs simultaneously. The action sheet `wireBtn` already calls `dialog.close()` before firing handlers — rely on this. Do not call `showConfirmDialog()` until after `dialog.close()` has been called.
- **Storing color without `CSS.supports()` validation:** CSS silently ignores invalid color values. A stored `"not-a-color"` produces a transparent tile with no JS error. Always validate on read using `CSS.supports('color', value)`.
- **Using `<input type="color">` in the action sheet:** The native iOS color wheel (iOS 17+) opens a large modal — visually jarring for a quick action. Use preset swatches; they also work on iOS 14-16 where the native picker is limited.
- **Forgetting `color` preservation in `transitionTile`:** If `transitionTile` doesn't forward `color` in the `has-sound`/`playing` branches, tapping a tile to play will clear the user-set color until the next app restart. Mirror the existing `label` forwarding pattern exactly.
- **Calling `showConfirmDialog()` from inside the action sheet wireBtn handler asynchronously without closing first:** The action sheet's `wireBtn` helper calls `dialog.close()` synchronously before invoking the handler, which is the correct order. Do not bypass this by calling `dialog.showModal()` for the confirm dialog within the same synchronous tick as the action sheet is still open.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirm dialog focus trap | Custom event-listener-based focus management | Native `<dialog>` with `showModal()` | `showModal()` traps focus automatically; browser handles Escape key; no custom code needed |
| Color validation | Regex or hex parser | `CSS.supports('color', value)` | Handles all CSS color formats (named, hex, hsl, etc.); available iOS Safari 14+ |
| Color parsing for contrast | Custom luminance math | Not needed for Phase 4 | Phase 4 uses a fixed preset palette with known dark backgrounds where white text is always readable; contrast check can be added later if users pick custom colors |
| Swatch layout | CSS grid/flexbox custom implementation | Standard `display: flex; gap; flex-wrap: wrap` on `.action-sheet-colors` | Sufficient; no library needed |

**Key insight:** Every Phase 4 feature is wiring of pre-existing platform primitives. The value is in the sequencing and the discipline of optional-field backward compatibility, not in novel code.

## Common Pitfalls

### Pitfall 1: Two Dialogs Open Simultaneously

**What goes wrong:** Calling `showConfirmDialog()` while the action sheet `<dialog>` is still open causes a DOMException: "HTMLDialogElement: Cannot call showModal on a dialog that is already open" — or on some browsers, both dialogs overlap in an undefined z-order.

**Why it happens:** The `wireBtn` helper in `action-sheet.ts` calls `dialog.close()` then invokes the handler. If the handler is async and calls `showConfirmDialog()` synchronously after `dialog.close()`, the close animation may not have completed, but `showModal()` of a second dialog can still fire. In practice on iOS Safari `dialog.close()` is synchronous — the element leaves the open state immediately — so calling `showConfirmDialog()` in the same tick is safe. The pattern is already used for `showRenameDialog` in `main.ts`'s `handleRename`.

**How to avoid:** Follow the existing `handleRename` pattern: `wireBtn` calls `dialog.close()` then calls the handler; the handler calls `showConfirmDialog()` (returning a Promise); `main.ts` awaits the result. No additional guards needed.

**Warning signs:** Console logs `InvalidStateError: The dialog element is not open` on confirm-cancel flow.

### Pitfall 2: IndexedDB Records Missing the New `color` Field

**What goes wrong:** After deploying Phase 4, existing tiles (recorded in v1.0) load from IndexedDB without a `color` field. Any code that accesses `record.color` without a nullish check may render the tile as transparent (CSS ignores `undefined` cast to string) or throw `TypeError`.

**Why it happens:** idb-keyval stores exactly what you passed to `set()`. Old records were saved without `color`. TypeScript optional fields (`color?: string`) are the correct model, but developers sometimes forget to apply the `?? fallback` pattern at every read site.

**How to avoid:** Three read sites in Phase 4 need the guard:
1. `applyTileState` in `tile.ts`: `tile.color ?? getTileColor(index)` — already shown in Pattern 6 above
2. `loadAllSlots` in `main.ts` bootstrap: when building initial `TileData` from loaded records, include `color: record.color` (which will be `undefined` for old records — that's fine, `TileData.color` is also optional)
3. `transitionTile` in `store.ts`: the `color` preservation line uses `data.color ?? tile.color` — both sides can be `undefined`, which is correct

**Warning signs:** Old tiles render with no color (transparent background) after the update. Duration badge shows `NaN s` (unrelated but indicates the same pattern failure).

### Pitfall 3: Action Sheet Swatch Listeners Accumulate on Repeated Opens

**What goes wrong:** If the color swatch row is built once in HTML and listeners are added on every `showActionSheet` call without cloning/replacing, each open adds another set of click listeners. After 3 opens, clicking a swatch fires the callback 3 times.

**Why it happens:** The `wireBtn` helper in `action-sheet.ts` already handles this for the main buttons via `cloneNode(true)` + `replaceWith`. The swatch row, if dynamically populated, must either use the same clone pattern or be rebuilt from scratch (`innerHTML = ''` then repopulate) on every `showActionSheet` call.

**How to avoid:** Rebuild the swatch row completely inside `showActionSheet` on every call (the approach shown in Pattern 7). This is cheap — 9-10 small buttons with inline styles. No accumulation possible.

**Warning signs:** Tapping a color swatch triggers `handleColorChange` multiple times; observable as multiple `saveSlot` calls in the console.

### Pitfall 4: `transitionTile` Drops Color on has-sound → playing → has-sound Round-Trip

**What goes wrong:** If `transitionTile` is updated for the `has-sound` branch but not the `playing` branch (or vice versa), the color is lost when the tile transitions through `playing` and back to `has-sound`. The tile reverts to the index-based default color after one playback.

**Why it happens:** Both `has-sound` and `playing` branches in `transitionTile` must forward `color`. The same issue exists for `label` and the codebase already handles both branches — mirroring this for `color` is a copy-paste.

**How to avoid:** Add `next.color = data.color ?? tile.color;` to both the `has-sound` and `playing` case in the same conditional block (they share `} else if (newState === 'has-sound' || newState === 'playing') {`).

**Warning signs:** Color reverts to the index default after tapping a tile to play it and waiting for it to finish.

## Code Examples

### Confirm Dialog — Full Flow

```typescript
// main.ts — updated handleLongPress onDelete callback
onDelete: () => {
  // action sheet is already closed by wireBtn before this runs
  showConfirmDialog('Sound löschen?').then((confirmed) => {
    if (!confirmed) return;
    deleteSlot(index)
      .then(() => {
        clearAudioCache(index);
        transitionTile(appState, index, 'empty');
        updateTile(index, appState.tiles[index]);
      })
      .catch((err: unknown) => {
        console.error('deleteSlot failed:', err);
      });
  });
},
```

### Bootstrap: Restore color from IndexedDB on App Start

```typescript
// main.ts — DOMContentLoaded, inside loadAllSlots().then()
slots.forEach((record, index) => {
  if (record) {
    const tile = transitionTile(appState, index, 'has-sound', {
      record,
      color: record.color,   // pass through — undefined for v1.0 records
    });
    tile.label = record.label;
    // tile.color is set by transitionTile via data.color
  }
});
```

### CSS: Confirm Dialog Styles

```css
/* style.css — confirm dialog (mirrors rename-dialog pattern) */
#confirm-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  width: min(300px, 88vw);
  border: none;
  border-radius: 14px;
  background: #2c2c2e;
  padding: 20px;
}

#confirm-dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
}

.confirm-dialog-message {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  margin-bottom: 18px;
  line-height: 1.4;
}

.confirm-dialog-actions {
  display: flex;
  gap: 10px;
}

.confirm-dialog-actions button {
  flex: 1;
  padding: 11px 10px;
  font-size: 16px;
  font-family: inherit;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  background: #3a3a3c;
  color: rgba(255, 255, 255, 0.7);
}

.confirm-dialog-actions button.destructive {
  background: #ff3b30;
  color: #fff;
  font-weight: 600;
}
```

### CSS: Color Swatch Row in Action Sheet

```css
/* style.css — color swatch row */
.action-sheet-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 16px;
  border-top: 0.5px solid rgba(255, 255, 255, 0.1);
  justify-content: center;
}

.color-swatch {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
}

.color-swatch:active {
  transform: scale(0.9);
}

.color-swatch--reset {
  background: #3a3a3c;
  /* Optional: use an ✕ icon inside */
}

.color-swatch--active {
  border-color: #fff;  /* indicate currently selected color */
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `window.confirm()` for destructive confirmation | `<dialog>` with `showModal()` | iOS 15.4+ fixed `<dialog>` in standalone PWA | `window.confirm()` is unreliable in iOS standalone PWA mode (confirmed broken); `<dialog>` is the correct pattern and already used in this codebase |
| Hard-coded tile accent colors only | User-selectable color with index-based fallback | Phase 4 (this phase) | Non-breaking; `color?: string` optional field; undefined reads fall back to existing `getTileColor(index)` |
| Duration badge only in `has-sound` | Duration badge in both `has-sound` and `playing` | Phase 4 (this phase) | One-line fix; data was always available |

**Deprecated/outdated:**
- `window.confirm()`: unreliable in iOS standalone PWA mode — always use `<dialog>` custom implementation
- `<input type="color">` in action sheet: iOS 17+ opens a large modal wheel; preset swatches are the correct iOS-native pattern for a constrained picker

## Open Questions

1. **Should the color swatch row show a checkmark/ring on the currently-active color?**
   - What we know: The action sheet already shows the tile index and duration; tile color is visible in the background of the tile itself; no active indicator is currently designed.
   - What's unclear: Whether the visual feedback from the tile color preview is sufficient UX, or whether an active ring on the current swatch aids discoverability.
   - Recommendation: Include a simple CSS `.color-swatch--active` class (shown in the CSS example above); pass `currentColor` to `showActionSheet` and set the class during swatch row construction. Low cost, high UX value.

2. **How many swatches — 8 or 9 (all TILE_COLORS)?**
   - What we know: `TILE_COLORS` has 9 entries (one per tile). The phase spec says "8 preset colors." Using all 9 exposes the full existing palette.
   - What's unclear: Whether 8 was a deliberate design constraint or an approximation.
   - Recommendation: Use all 9 existing `TILE_COLORS` plus a "reset" swatch (10 total). This reuses the existing palette definition with no duplication and allows any tile to take any color.

3. **Where to show the "Farbe" section label in the action sheet?**
   - What we know: The current action sheet has no section labels; buttons run flush.
   - What's unclear: Whether to add a small section header ("Farbe") above the swatch row, or just let the swatch row speak for itself.
   - Recommendation: Add a small muted label `<p class="action-sheet-section-label">Farbe</p>` above the swatch row for clarity. One additional element, no CSS complexity.

## Sources

### Primary (HIGH confidence)

- Codebase: `/Users/rotmanov/git/private/soundboard/src/ui/rename-dialog.ts` — confirmed `<dialog>` + clone-before-wire pattern, `Promise<string | null>` return, `showModal()` usage
- Codebase: `/Users/rotmanov/git/private/soundboard/src/ui/action-sheet.ts` — confirmed `wireBtn` pattern, `cloneNode(true)` + `replaceWith`, `dialog.close()` before handler invocation
- Codebase: `/Users/rotmanov/git/private/soundboard/src/storage/db.ts` — confirmed `durationSeconds?: number` and `label?: string` optional field pattern; confirmed no migration needed
- Codebase: `/Users/rotmanov/git/private/soundboard/src/state/store.ts` — confirmed `label` forwarding in `transitionTile` (lines 70-71); `color` must mirror this exactly
- Codebase: `/Users/rotmanov/git/private/soundboard/src/ui/tile.ts` — confirmed `has-sound` branch renders `tile-duration` badge (lines 61-63); confirmed `playing` branch does not (lines 71-76 — the gap); confirmed `TILE_COLORS` array available for swatch reuse; confirmed `--tile-color` CSS var already set in `applyTileState`
- Codebase: `/Users/rotmanov/git/private/soundboard/src/main.ts` — confirmed `handleRename` pattern for async dialog within action sheet callback (lines 278-289); confirmed `onDelete` currently has no confirmation (lines 259-269)
- Codebase: `/Users/rotmanov/git/private/soundboard/src/style.css` — confirmed `#rename-dialog` CSS as the style template for the new confirm dialog; confirmed `.action-sheet-content` layout for swatch row insertion point
- Codebase: `/Users/rotmanov/git/private/soundboard/index.html` — confirmed `#action-sheet` DOM structure; confirmed `#rename-dialog` as template for confirm dialog markup
- Prior research: `.planning/research/SUMMARY.md` — Phase 1 (Foundation) marked "standard patterns, no additional research needed" with HIGH confidence
- Prior research: `.planning/research/ARCHITECTURE.md` — Build order, SlotRecord schema, confirm dialog integration pattern, all at HIGH confidence
- Prior research: `.planning/research/PITFALLS.md` — Pitfall V9 (SlotRecord backward compat), Pitfall V11 (CSS.supports color guard), dialog sequencing constraint (Pitfall V9 note)

### Secondary (MEDIUM confidence)

- Prior research: `.planning/research/FEATURES.md` — UX-01 confirm dialog `<dialog>` pattern; UX-02 badge display states; COLOR-01 swatch UI vs native picker decision — all verified against codebase
- MDN — `<dialog>` element: `showModal()`, focus trap, `close` event — confirmed supported on iOS Safari 15.4+ for standalone PWA (prior research verified this is in production)
- MDN — `CSS.supports()`: available iOS Safari 14+ — compatible with project's iOS 14.3+ target

### Tertiary (LOW confidence)

None for Phase 4. All claims are codebase-verified or backed by prior high-confidence research.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all patterns are already in production in this codebase
- Architecture: HIGH — exact file locations, function signatures, and existing patterns identified from codebase read; build order derived from schema dependency chain
- Pitfalls: HIGH — all four pitfalls are codebase-specific (not iOS-specific), identified directly from reading the existing code

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days — stable patterns, no fast-moving dependencies)
