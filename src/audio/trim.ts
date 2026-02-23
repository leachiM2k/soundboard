// Silence trimming via AudioBuffer offset detection.
// The blob in IndexedDB is NEVER modified — trim is lossless metadata only.
// Offsets are stored in SlotRecord and applied via AudioBufferSourceNode.start().

import { SlotRecord } from '../storage/db';

/**
 * Scan an AudioBuffer to find the start and end of non-silent audio.
 * Returns { startSec, endSec } — the time range containing actual audio.
 * Returns null if the entire clip is silent (no sample above threshold).
 *
 * IMPORTANT: getChannelData() returns a live Float32Array view — never mutate it.
 *
 * @param buf       The AudioBuffer to scan (from cache — not re-decoded here).
 * @param threshold Amplitude threshold; samples below this level are treated as silence.
 *                  0.01 = 1% of peak amplitude, standard for voice recordings.
 */
export function findTrimOffsets(
  buf: AudioBuffer,
  threshold = 0.01,
): { startSec: number; endSec: number } | null {
  const { sampleRate, length, numberOfChannels } = buf;

  // Find first non-silent sample (any channel above threshold)
  let startSample = -1;
  outer: for (let i = 0; i < length; i++) {
    for (let c = 0; c < numberOfChannels; c++) {
      if (Math.abs(buf.getChannelData(c)[i]!) > threshold) {
        startSample = i;
        break outer;
      }
    }
  }

  // Entire clip is silent — no audio above threshold
  if (startSample === -1) return null;

  // Find last non-silent sample (any channel above threshold)
  let endSample = -1;
  outer2: for (let i = length - 1; i >= startSample; i--) {
    for (let c = 0; c < numberOfChannels; c++) {
      if (Math.abs(buf.getChannelData(c)[i]!) > threshold) {
        endSample = i;
        break outer2;
      }
    }
  }

  // 5ms grace margin: avoids clipping the first/last phoneme
  const grace = Math.round(sampleRate * 0.005);
  const startSec = Math.max(0, startSample - grace) / sampleRate;
  const endSec = Math.min(length - 1, endSample + grace) / sampleRate;

  // Guard: clip is effectively silent if detectable range is < 100ms
  if (endSec - startSec < 0.1) return null;

  return { startSec, endSec };
}

/**
 * Return a new SlotRecord with trim offsets applied.
 * Does NOT mutate the original record (returns a spread copy).
 * Updates durationSeconds to reflect the trimmed portion.
 *
 * @param record   The existing SlotRecord to trim.
 * @param startSec Trim start offset in seconds (from findTrimOffsets).
 * @param endSec   Trim end offset in seconds (from findTrimOffsets).
 */
export function applyTrimToRecord(
  record: SlotRecord,
  startSec: number,
  endSec: number,
): SlotRecord {
  return {
    ...record,
    trimStartSec: startSec,
    trimEndSec: endSec,
    durationSeconds: Math.round(endSec - startSec),
  };
}
