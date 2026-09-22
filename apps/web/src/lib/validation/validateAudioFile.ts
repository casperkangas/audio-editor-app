// Supported audio MIME types (FR-002)
export const SUPPORTED_MIME_TYPES = [
  "audio/mpeg",       // MP3
  "audio/wav",        // WAV
  "audio/x-wav",      // WAV (alternate)
  "audio/flac",       // FLAC
  "audio/x-flac",     // FLAC (alternate)
  "audio/ogg",        // OGG
  "audio/aac",        // AAC
  "audio/x-aac",      // AAC (alternate)
] as const;

// Limits (FR-002, SC-006)
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MiB
export const MAX_DURATION_SECONDS = 2 * 60 * 60;     // 2 hours

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export interface AudioFileLike {
  name: string;
  size: number;
  type: string;
}

/**
 * Validates an audio file before it is loaded into the editor.
 * Checks MIME type, file size, and basic integrity (FR-002, FR-003).
 * Returns a plain-language reason on failure so the UI can show it directly.
 */
export function validateAudioFile(file: AudioFileLike): ValidationResult {
  // Empty file
  if (file.size === 0) {
    return {
      valid: false,
      reason: "The file appears to be empty. Please choose a valid audio file.",
    };
  }

  // Size limit
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const limitMB = MAX_FILE_SIZE_BYTES / (1024 * 1024);
    return {
      valid: false,
      reason: `The file is too large. Please upload a file smaller than ${limitMB} MB.`,
    };
  }

  // MIME type check
  if (!SUPPORTED_MIME_TYPES.includes(file.type as typeof SUPPORTED_MIME_TYPES[number])) {
    return {
      valid: false,
      reason:
        "That file type is not supported. Please upload an MP3, WAV, FLAC, OGG, or AAC file.",
    };
  }

  return { valid: true };
}
