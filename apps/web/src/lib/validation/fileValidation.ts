/**
 * lib/validation/fileValidation.ts
 *
 * Client-side validation of user-uploaded audio files before decoding.
 */

import type { ValidationResult } from '../../types';
import { SUPPORTED_MIME_TYPES, MAX_FILE_SIZE_BYTES, MAX_DURATION_SECONDS } from '../../types';

export function validateAudioFile(file: File): ValidationResult {
  const errors: string[] = [];

  // MIME type check
  const mimeOk = (SUPPORTED_MIME_TYPES as readonly string[]).includes(file.type);
  if (!mimeOk) {
    errors.push(
      `Unsupported file type "${file.type || 'unknown'}". ` +
        'Please upload a WAV, MP3, FLAC, OGG, or AAC file.',
    );
  }

  // Size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0);
    errors.push(`File is too large. Maximum allowed size is ${mb} MB.`);
  }

  if (file.size === 0) {
    errors.push('The file appears to be empty.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Post-decode duration check.  Call this after AudioContext.decodeAudioData
 * succeeds to guard against absurdly long files.
 */
export function validateAudioDuration(buffer: AudioBuffer): ValidationResult {
  const errors: string[] = [];

  if (buffer.duration > MAX_DURATION_SECONDS) {
    const hours = (MAX_DURATION_SECONDS / 3600).toFixed(0);
    errors.push(`Audio is too long. Maximum supported duration is ${hours} hour(s).`);
  }

  if (buffer.duration <= 0) {
    errors.push('The audio file appears to have no content.');
  }

  return { valid: errors.length === 0, errors };
}
