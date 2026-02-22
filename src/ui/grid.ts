import type { AppState, TileData } from '../state/store';
import { buildTileElement, updateTileElement } from './tile';
import { attachLongPress } from '../input/long-press';

let _initialized = false;

/**
 * Initialize the grid: create all 9 tile elements and append to #grid.
 * Call once on DOMContentLoaded. Use updateTile() for subsequent updates.
 */
export function initGrid(
  state: AppState,
  onTileTap: (index: number) => void,
  onTileLongPress: (index: number) => void,
): void {
  const grid = document.getElementById('grid');
  if (!grid) throw new Error('Grid container #grid not found in DOM');
  if (_initialized) {
    console.warn('initGrid called more than once — ignored');
    return;
  }
  _initialized = true;

  grid.innerHTML = '';

  state.tiles.forEach((tile, index) => {
    const el = buildTileElement(index, tile);

    // Tap handler — click event fires reliably on both mouse and touch
    el.addEventListener('click', () => onTileTap(index));

    // Long-press handler — wired internally so main.ts doesn't need to iterate elements
    const cleanup = attachLongPress(el, () => onTileLongPress(index));
    // Store cleanup per-element if we ever need to detach (Phase 3 — not needed now)
    void cleanup;

    grid.appendChild(el);
  });
}

/**
 * Update a single tile's visual state without recreating it.
 * Preserves event listeners. Call after every transitionTile().
 */
export function updateTile(index: number, tile: TileData): void {
  updateTileElement(index, tile);
}

/**
 * Update all 9 tiles at once. Use after bulk state changes (e.g., initial load).
 */
export function updateAllTiles(state: AppState): void {
  state.tiles.forEach((tile, index) => updateTileElement(index, tile));
}
