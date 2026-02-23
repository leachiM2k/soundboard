export type TileState =
  | 'empty'
  | 'recording'
  | 'saving'
  | 'has-sound'
  | 'playing'
  | 'error';

export interface TileData {
  state: TileState;
  /** Present when state is 'recording' — used to stop the active recording session */
  activeRecording?: import('../audio/recorder').ActiveRecording;
  /** Present when state is 'has-sound' or 'playing' — the persisted record */
  record?: import('../storage/db').SlotRecord;
  /** Present when state is 'error' — inline message to show the user */
  errorMessage?: string;
  /** Whether this slot was at 'recording' state when the 25s warning fired */
  warningActive?: boolean;
  /** User-set tile name, synced from SlotRecord.label. */
  label?: string;
  // NEW: synced from SlotRecord.color
  color?: string;
}

export interface AppState {
  tiles: TileData[];
}

/**
 * Create the initial AppState for 9 tiles.
 * All tiles start as 'empty'. Main.ts will call loadAllSlots() and
 * transition filled tiles to 'has-sound' on boot.
 */
export function createAppState(): AppState {
  return {
    tiles: Array.from({ length: 9 }, (): TileData => ({ state: 'empty' })),
  };
}

/**
 * Transition a tile to a new state, merging in any additional TileData fields.
 * Mutates the AppState in place (simpler than immutable updates for 9 slots).
 * Returns the updated TileData for the given index.
 *
 * Valid transitions:
 *   empty      → recording  (getUserMedia succeeds)
 *   empty      → error      (getUserMedia fails)
 *   recording  → saving     (manual stop or 30s auto-stop)
 *   saving     → has-sound  (saveSlot completes)
 *   saving     → error      (saveSlot fails)
 *   has-sound  → playing    (user taps filled tile)
 *   playing    → has-sound  (playback completes or user re-taps)
 *   has-sound  → error      (decodeAudioData fails on defective blob)
 *   error      → empty      (recording error — user retries)
 *   error      → has-sound  (after showing error for defective blob)
 */
export function transitionTile(
  appState: AppState,
  index: number,
  newState: TileState,
  data: Partial<Omit<TileData, 'state'>> = {},
): TileData {
  const tile = appState.tiles[index];
  if (!tile) throw new RangeError(`Tile index ${index} out of range (0-8)`);

  // Clear fields that don't belong to the new state to avoid stale data
  const next: TileData = { state: newState };
  if (newState === 'recording') {
    next.activeRecording = data.activeRecording;
    next.warningActive = false;
  } else if (newState === 'has-sound' || newState === 'playing') {
    next.record = data.record ?? tile.record;
    next.label = data.label ?? tile.label;
    next.color = data.color ?? tile.color;
  } else if (newState === 'error') {
    next.errorMessage = data.errorMessage;
    // Preserve record for 'error' on defective blob (tile stays has-sound conceptually)
    next.record = data.record ?? tile.record;
    next.label = data.label ?? tile.label;
  }

  appState.tiles[index] = next;
  return next;
}
