import {
  EXPORT_ERROR_CODES,
  EXPORT_ERROR_MESSAGES,
  type ExportErrorCode,
} from "./export.validation.js";

export interface ExportApiError {
  readonly status: number;
  readonly errorCode: ExportErrorCode;
  readonly message: string;
}

const ERROR_STATUSES: Readonly<Record<ExportErrorCode, number>> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 404,
  SOURCE_NOT_FOUND: 404,
  UNSUPPORTED_FORMAT: 400,
  INVALID_QUALITY: 400,
  INVALID_OPERATION: 400,
  DUPLICATE_ACTIVE_JOB: 409,
  QUEUE_UNAVAILABLE: 503,
  SOURCE_INVALID: 422,
  UNSUPPORTED_CODEC: 422,
  PROCESSING_FAILED: 500,
};

export function isExportErrorCode(value: unknown): value is ExportErrorCode {
  return (
    typeof value === "string" &&
    (EXPORT_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function toExportApiError(errorCode: ExportErrorCode): ExportApiError {
  return {
    status: ERROR_STATUSES[errorCode],
    errorCode,
    message: EXPORT_ERROR_MESSAGES[errorCode],
  };
}

export function toUnexpectedExportError(): ExportApiError {
  return toExportApiError("PROCESSING_FAILED");
}

export function isSensitiveErrorText(value: string): boolean {
  return /blob|token|secret|credential|ffmpeg|ffprobe|redis|redis_url|https?:\/\//i.test(
    value,
  );
}
