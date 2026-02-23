// idb-keyval stores SlotRecords at integer keys 0-8 (one per tile).
// Uses the default keyval-store — no custom store needed for 9 keys.
// All persistence operations go through this module exclusively.

import { get, set, del, getMany } from 'idb-keyval';

export interface SlotRecord {
  blob: Blob;        // Raw audio blob from MediaRecorder
  mimeType: string;  // Detected at recording time; required for correct playback
  recordedAt: number; // Date.now() at recording completion
  /** Elapsed recording time in seconds (added Phase 2). undefined for pre-Phase-2 records. */
  durationSeconds?: number;
  /** User-customizable tile name. undefined = no label set. */
  label?: string;
  // NEW: user-chosen CSS color. undefined = use index-based default
  color?: string;
  /** Trim start offset in seconds. undefined = no trim applied (play from beginning). */
  trimStartSec?: number;
  /** Trim end offset in seconds. undefined = no trim applied (play to natural end). */
  trimEndSec?: number;
}

// SlotIndex is 0-8, mapping directly to tile positions in the 3x3 grid.
// Using number (not a union type) to allow runtime-computed indices.
export type SlotIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Load all 9 slots in a single IndexedDB transaction. Returns undefined for empty slots. */
export async function loadAllSlots(): Promise<(SlotRecord | undefined)[]> {
  return getMany([0, 1, 2, 3, 4, 5, 6, 7, 8]);
}

/** Get a single slot. Returns undefined if empty. */
export async function loadSlot(index: SlotIndex): Promise<SlotRecord | undefined> {
  return get(index);
}

/** Persist a recording to the slot. Overwrites any existing recording at that position. */
export async function saveSlot(index: SlotIndex, record: SlotRecord): Promise<void> {
  await set(index, record);
}

/** Remove a slot's recording. The slot returns to empty state. */
export async function deleteSlot(index: SlotIndex): Promise<void> {
  await del(index);
}

/**
 * Request persistent IndexedDB storage to mitigate Safari's 7-day eviction in browser mode.
 * Call on first user interaction — NOT on app startup (reduces grant probability if called early).
 * Safari 17+ supports this; earlier versions resolve to false (no-op).
 * Home Screen PWA installs receive a higher storage quota regardless of this call.
 */
let persistenceRequested = false;
export async function requestStoragePersistence(): Promise<void> {
  if (persistenceRequested) return;
  persistenceRequested = true;
  if (!navigator.storage?.persist) return;
  const alreadyPersisted = await navigator.storage.persisted();
  if (!alreadyPersisted) {
    await navigator.storage.persist();
  }
}
