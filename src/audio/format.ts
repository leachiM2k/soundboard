// Probe MediaRecorder.isTypeSupported() in priority order.
// iOS Safari supports only audio/mp4 (AAC). Chrome/Firefox support audio/webm.
// The detected type is exported as a constant for all modules to import.
// Never hardcode a MIME type — it WILL fail on at least one major browser.

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus', // Chrome, Firefox, Edge (best quality/size)
  'audio/webm',             // Chrome fallback
  'audio/mp4',              // iOS Safari (AAC inside MP4 container)
  'audio/ogg;codecs=opus',  // Firefox fallback
] as const;

export function detectSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return ''; // Browser chooses — last resort only
}

// Called once at module load. All modules import this constant.
export const RECORDING_MIME_TYPE: string = detectSupportedMimeType();
