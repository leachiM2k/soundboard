import { SlotRecord } from '../storage/db';

export function isStandaloneMode(): boolean {
  return !!(window.navigator as { standalone?: boolean }).standalone
    || window.matchMedia('(display-mode: standalone)').matches;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportClip(record: SlotRecord, index: number): void {
  const ext = record.mimeType.includes('mp4') ? 'm4a'
    : record.mimeType.includes('webm') ? 'webm'
    : record.mimeType.includes('ogg') ? 'ogg'
    : 'audio';
  const fileName = `sound-${index + 1}.${ext}`;

  // Pre-create File object SYNCHRONOUSLY — blob already in record, no async needed
  const file = new File([record.blob], fileName, { type: record.mimeType });

  const isStandalone = isStandaloneMode();

  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: fileName })
      .catch((err: Error) => {
        // AbortError = user cancelled — NOT an error, do nothing
        if (err.name !== 'AbortError' && !isStandalone) {
          triggerDownload(record.blob, fileName);
        }
      });
    return;
  }

  if (!isStandalone) {
    triggerDownload(record.blob, fileName);
  }
  // Standalone + no share: do nothing (requirements: suppress download in standalone)
}
