import type { TileData } from '../state/store';

/** 9 distinct accent colors — one per slot index. Bold, playful, classic soundboard palette. */
export const TILE_COLORS: readonly string[] = [
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
  return TILE_COLORS[index % TILE_COLORS.length] as string;
}

/**
 * Format seconds as M:SS (e.g., 0:03, 1:30).
 * Used for tile duration display and action sheet header.
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Escape HTML to prevent XSS from user-supplied tile labels.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the inner HTML content string for a tile based on its state.
 * Called by updateTileElement to set tile innerHTML.
 */
export function buildTileContent(index: number, tile: TileData): string {
  switch (tile.state) {
    case 'empty':
      return '<span class="tile-icon">🎙</span>';

    case 'recording':
      return `
        <span class="tile-elapsed" id="timer-elapsed-${index}">0:00</span>
        <span class="tile-remaining" id="timer-remaining-${index}">0:30</span>
      `;

    case 'saving':
      return '<span class="tile-icon tile-icon--saving">···</span>';

    case 'has-sound': {
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

    case 'error':
      return '<span class="tile-icon tile-icon--error">!</span>';

    default: {
      const _exhaustive: never = tile.state;
      console.error('Unknown tile state in buildTileContent:', _exhaustive);
      return '';
    }
  }
}

/**
 * Create a fresh tile DOM element for a given slot index.
 * The element is a <div> with data-slot attribute and initial state classes.
 * Event listeners (tap, long-press) are attached by grid.ts, not here.
 */
export function buildTileElement(index: number, tile: TileData): HTMLDivElement {
  const el = document.createElement('div');
  el.dataset.slot = String(index);
  el.className = 'tile';
  applyTileState(el, index, tile);
  return el;
}

/**
 * Update an existing tile element in place without recreating it.
 * Preserves event listeners attached by grid.ts.
 */
export function updateTileElement(index: number, tile: TileData): void {
  const el = document.querySelector(`[data-slot="${index}"]`) as HTMLElement | null;
  if (!el) return;
  applyTileState(el, index, tile);
}

function applyTileState(el: HTMLElement, index: number, tile: TileData): void {
  // Remove all state modifier classes
  el.className = 'tile';
  // Add state-specific modifier class (CSS uses tile-- prefix)
  const cssState = tile.state === 'has-sound' ? 'has-sound' : tile.state;
  el.classList.add(`tile--${cssState}`);

  // Apply accent color for filled and playing states
  if (tile.state === 'has-sound' || tile.state === 'playing') {
    const raw = tile.color;
    const validated = raw && CSS.supports('color', raw) ? raw : null;
    el.style.setProperty('--tile-color', validated ?? getTileColor(index));
  } else {
    el.style.removeProperty('--tile-color');
  }

  // Set inner content
  el.innerHTML = buildTileContent(index, tile);
}
