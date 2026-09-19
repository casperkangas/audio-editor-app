export const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export const ALLOWED_AUDIO_CONTENT_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/aac",
  "audio/x-aac",
  "audio/mp4",
  "audio/x-m4a",
] as const;

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "wav",
]);

export function getMaxUploadSizeBytes(
  environmentValue = process.env.AUDIO_UPLOAD_MAX_SIZE_BYTES,
): number {
  if (!environmentValue) {
    return DEFAULT_MAX_UPLOAD_SIZE_BYTES;
  }

  const parsedValue = Number(environmentValue);
  return Number.isSafeInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_MAX_UPLOAD_SIZE_BYTES;
}

export function isAllowedAudioFilename(pathname: string): boolean {
  const filename = pathname.trim();
  const extension = filename.split(".").pop()?.toLowerCase();

  return Boolean(
    filename &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    !filename.includes("..") &&
    extension &&
    ALLOWED_AUDIO_EXTENSIONS.has(extension),
  );
}

export function isAllowedAudioContentType(contentType: string): boolean {
  return (ALLOWED_AUDIO_CONTENT_TYPES as readonly string[]).includes(
    contentType.toLowerCase(),
  );
}
