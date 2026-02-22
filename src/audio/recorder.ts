import { RECORDING_MIME_TYPE } from './format';

export interface RecordingResult {
  blob: Blob;
  mimeType: string; // The actual MIME type of the assembled blob
}

export interface ActiveRecording {
  /** Call to stop recording early (manual stop by user). Triggers onstop → onComplete. */
  stop: () => void;
}

// ------- Microphone stream management -------

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,  // Removes mic-from-speaker feedback
  noiseSuppression: true,  // Reduces background noise for speech
  autoGainControl: true,   // Normalizes voice level variations
  // sampleRate: intentionally not set — iOS Safari locks to device rate (44100/48000 Hz)
  // channelCount: not set — iOS defaults to mono for voice; forcing stereo increases file size
};

// Cached stream: reuse across recording sessions to avoid WebKit bug #215884
// (repeated getUserMedia calls in standalone PWA mode trigger re-permission prompts)
let cachedStream: MediaStream | null = null;

/**
 * Acquire the microphone stream lazily (call on first tap, not on app startup).
 * Reuses the cached stream if still active.
 * Throws on NotAllowedError (permission denied), NotFoundError (no mic), NotReadableError (hardware).
 * Caller is responsible for showing the inline error message (per CONTEXT.md locked decision).
 */
export async function getMicrophoneStream(): Promise<MediaStream> {
  if (cachedStream && cachedStream.active) {
    return cachedStream;
  }
  // cachedStream is inactive (tracks ended) — request a fresh stream
  cachedStream = null;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: AUDIO_CONSTRAINTS,
    video: false,
  });
  cachedStream = stream;
  return stream;
}

// ------- Recording session -------

const WARNING_MS = 25_000; // 25 seconds — warn user before limit
const MAX_MS = 30_000;     // 30 seconds — auto-stop; save everything recorded

/**
 * Start a MediaRecorder session on the provided stream.
 * Returns an ActiveRecording handle with a stop() method for manual early stop.
 *
 * @param stream     MediaStream from getMicrophoneStream()
 * @param onComplete Called with the assembled RecordingResult when recording finishes
 * @param onWarning  Called at 25s (5s before auto-stop); use to show visual indicator
 */
export function startRecording(
  stream: MediaStream,
  onComplete: (result: RecordingResult) => void,
  onWarning?: () => void,
): ActiveRecording {
  const chunks: BlobPart[] = [];

  // Use RECORDING_MIME_TYPE detected at startup (never hardcode — breaks on iOS or Chrome).
  // audioBitsPerSecond is intentionally not set: iOS Safari may ignore it,
  // and AAC default bitrate produces well under 500 KB for 30s of mono speech.
  const options: MediaRecorderOptions = RECORDING_MIME_TYPE
    ? { mimeType: RECORDING_MIME_TYPE }
    : {};

  const recorder = new MediaRecorder(stream, options);

  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onstop = () => {
    // Assemble final blob from all collected chunks.
    // Use recorder.mimeType as fallback in case RECORDING_MIME_TYPE was empty string.
    const finalMimeType = RECORDING_MIME_TYPE || recorder.mimeType;
    const blob = new Blob(chunks, { type: finalMimeType });
    onComplete({ blob, mimeType: blob.type });
  };

  // Warning timer: fire at 25s to allow caller to show visual indicator
  const warnTimer = onWarning ? setTimeout(onWarning, WARNING_MS) : null;

  // Auto-stop timer: stop and save at 30s.
  // Guard with state check: do NOT call stop() if recorder is already inactive
  // (user may have manually stopped just before the timer fires — Pitfall 6).
  const stopTimer = setTimeout(() => {
    if (recorder.state === 'recording') {
      recorder.stop();
    }
  }, MAX_MS);

  // Start with no timeslice: single ondataavailable chunk at stop time.
  // Chunked recording with short timeslices is unreliable on iOS Safari.
  recorder.start();

  return {
    stop: () => {
      // Cancel timers first to prevent double-stop race
      if (warnTimer !== null) clearTimeout(warnTimer);
      clearTimeout(stopTimer);
      // Guard: only call stop() if still recording (Pitfall 6)
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    },
  };
}
