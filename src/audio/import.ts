import { SlotRecord } from '../storage/db';
import { getAudioContext } from './player';

export function pickAudioFile(): Promise<SlotRecord | null> {
  return new Promise((resolve, reject) => {
    const input = document.getElementById('import-file-input') as HTMLInputElement;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = ''; // reset so same file can be re-selected
      if (!file) { resolve(null); return; }
      decodeAndBuild(file).then(resolve).catch(reject);
    }, { once: true });
    input.click(); // called synchronously inside Promise executor — gesture context preserved
  });
}

async function decodeAndBuild(file: File): Promise<SlotRecord> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = getAudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer); // throws on unsupported/corrupt
  return {
    blob: file, // File extends Blob
    mimeType: file.type || 'audio/mpeg',
    recordedAt: Date.now(),
    durationSeconds: Math.round(audioBuffer.duration),
  };
}
