export const EXPORT_FORMATS = ["wav", "mp3", "flac", "ogg", "aac"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const EXPORT_STAGES = [
  "queued",
  "validating",
  "rendering",
  "finalizing",
  "succeeded",
  "failed",
] as const;

export type ExportStage = (typeof EXPORT_STAGES)[number];

export const EXPORT_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "SOURCE_NOT_FOUND",
  "UNSUPPORTED_FORMAT",
  "INVALID_QUALITY",
  "INVALID_OPERATION",
  "DUPLICATE_ACTIVE_JOB",
  "QUEUE_UNAVAILABLE",
  "SOURCE_INVALID",
  "UNSUPPORTED_CODEC",
  "PROCESSING_FAILED",
] as const;

export type ExportErrorCode = (typeof EXPORT_ERROR_CODES)[number];

export interface ExportOperationSnapshot {
  readonly id: string;
  readonly type: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
}

export interface ExportSettings {
  readonly format: ExportFormat;
  readonly bitrate?: string;
  readonly qualityPreset?: string;
}

export interface ExportRequest {
  readonly projectId: string;
  readonly sourceRevision: number;
  readonly sourceBlobKey: string;
  readonly operations: readonly ExportOperationSnapshot[];
  readonly settings: ExportSettings;
}

export interface ExportStatusResponse {
  readonly jobId: string;
  readonly status: ExportStatus;
  readonly stage: ExportStage;
  readonly progressPercent: number;
  readonly message: string;
  readonly downloadUrl?: string | null;
  readonly errorCode?: ExportErrorCode | null;
  readonly error?: string | null;
}

export interface ValidationSuccess<T> {
  readonly valid: true;
  readonly value: T;
}

export interface ValidationFailure {
  readonly valid: false;
  readonly errorCode: ExportErrorCode;
  readonly message: string;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isExportFormat(value: unknown): value is ExportFormat {
  return (
    typeof value === "string" &&
    (EXPORT_FORMATS as readonly string[]).includes(value)
  );
}

function isOperationSnapshot(value: unknown): value is ExportOperationSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.type) &&
    isRecord(value.params) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt)
  );
}

function isSettings(value: unknown): value is ExportSettings {
  if (!isRecord(value) || !isExportFormat(value.format)) {
    return false;
  }

  return (
    (value.bitrate === undefined || isNonEmptyString(value.bitrate)) &&
    (value.qualityPreset === undefined || isNonEmptyString(value.qualityPreset))
  );
}

export function parseExportRequest(
  input: unknown,
): ValidationResult<ExportRequest> {
  if (!isRecord(input)) {
    return {
      valid: false,
      errorCode: "INVALID_REQUEST",
      message: "The export request is invalid.",
    };
  }

  const operations = input.operations;
  if (
    !isNonEmptyString(input.projectId) ||
    typeof input.sourceRevision !== "number" ||
    !Number.isSafeInteger(input.sourceRevision) ||
    input.sourceRevision < 0 ||
    !isNonEmptyString(input.sourceBlobKey) ||
    !Array.isArray(operations) ||
    !operations.every(isOperationSnapshot) ||
    !isSettings(input.settings)
  ) {
    return {
      valid: false,
      errorCode: "INVALID_REQUEST",
      message: "The export request is invalid.",
    };
  }

  return {
    valid: true,
    value: {
      projectId: input.projectId,
      sourceRevision: input.sourceRevision,
      sourceBlobKey: input.sourceBlobKey,
      operations,
      settings: input.settings,
    },
  };
}
