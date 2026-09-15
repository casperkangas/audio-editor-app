export const EXPORT_FORMATS = ["wav", "mp3", "flac", "ogg", "aac"] as const;

export const MAX_EXPORT_OPERATIONS = 100;
export const MAX_AUDIO_DURATION_SECONDS = 2 * 60 * 60;

const ALLOWED_OPERATION_TYPES = [
  "trim",
  "cut",
  "split",
  "volume",
  "fade-in",
  "fade-out",
] as const;

const LOSSY_BITRATES = [
  "64k",
  "96k",
  "128k",
  "160k",
  "192k",
  "256k",
  "320k",
] as const;
const LOSSY_QUALITY_PRESETS = ["low", "medium", "high"] as const;

const FORMAT_POLICIES = {
  wav: { extension: "wav", contentType: "audio/wav", lossless: true },
  mp3: { extension: "mp3", contentType: "audio/mpeg", lossless: false },
  flac: { extension: "flac", contentType: "audio/flac", lossless: true },
  ogg: { extension: "ogg", contentType: "audio/ogg", lossless: false },
  aac: { extension: "aac", contentType: "audio/aac", lossless: false },
} as const;

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

export interface ValidatedExportSettings extends ExportSettings {
  readonly extension: string;
  readonly contentType: string;
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function invalidOperation(message: string): ValidationFailure {
  return { valid: false, errorCode: "INVALID_OPERATION", message };
}

function validateTimeRange(
  params: Record<string, unknown>,
  durationSeconds: number,
): boolean {
  return (
    isFiniteNumber(params.startTime) &&
    isFiniteNumber(params.endTime) &&
    params.startTime >= 0 &&
    params.endTime <= durationSeconds &&
    params.startTime < params.endTime
  );
}

export function validateEditOperations(
  operations: readonly unknown[],
  sourceDurationSeconds: number,
): ValidationResult<readonly ExportOperationSnapshot[]> {
  if (
    !isFiniteNumber(sourceDurationSeconds) ||
    sourceDurationSeconds <= 0 ||
    sourceDurationSeconds > MAX_AUDIO_DURATION_SECONDS
  ) {
    return invalidOperation(
      "The audio duration is outside the supported range.",
    );
  }

  if (operations.length > MAX_EXPORT_OPERATIONS) {
    return invalidOperation("The export contains too many edit operations.");
  }

  const normalized: ExportOperationSnapshot[] = [];
  for (const operation of operations) {
    if (!isOperationSnapshot(operation)) {
      return invalidOperation("One or more edit operations are invalid.");
    }

    const params = operation.params;
    if (
      !(ALLOWED_OPERATION_TYPES as readonly string[]).includes(operation.type)
    ) {
      return invalidOperation("This edit operation is not supported.");
    }

    let normalizedParams: Record<string, number> = {};
    switch (operation.type) {
      case "trim":
      case "cut":
        if (!validateTimeRange(params, sourceDurationSeconds)) {
          return invalidOperation(
            "An edit range is outside the audio duration.",
          );
        }
        normalizedParams = {
          startTime: params.startTime as number,
          endTime: params.endTime as number,
        };
        break;
      case "split":
        if (
          !isFiniteNumber(params.at) ||
          params.at <= 0 ||
          params.at >= sourceDurationSeconds
        ) {
          return invalidOperation(
            "The split point is outside the audio duration.",
          );
        }
        normalizedParams = { at: params.at };
        break;
      case "volume":
        if (
          !validateTimeRange(params, sourceDurationSeconds) ||
          !isFiniteNumber(params.gain) ||
          params.gain < 0 ||
          params.gain > 2
        ) {
          return invalidOperation("The volume edit is invalid.");
        }
        normalizedParams = {
          startTime: params.startTime as number,
          endTime: params.endTime as number,
          gain: params.gain,
        };
        break;
      case "fade-in":
      case "fade-out":
        if (
          !isFiniteNumber(params.startTime) ||
          !isFiniteNumber(params.duration) ||
          params.startTime < 0 ||
          params.duration <= 0 ||
          params.startTime + params.duration > sourceDurationSeconds
        ) {
          return invalidOperation(
            "The fade edit is outside the audio duration.",
          );
        }
        normalizedParams = {
          startTime: params.startTime,
          duration: params.duration,
        };
        break;
    }

    normalized.push({
      id: operation.id,
      type: operation.type,
      params: Object.freeze({ ...normalizedParams }),
      createdAt: operation.createdAt,
    });
  }

  return { valid: true, value: Object.freeze(normalized) };
}

export function validateExportSettings(
  settings: unknown,
): ValidationResult<ValidatedExportSettings> {
  if (!isRecord(settings) || !isExportFormat(settings.format)) {
    return {
      valid: false,
      errorCode: "UNSUPPORTED_FORMAT",
      message: "The selected export format is not supported.",
    };
  }

  if (!isSettings(settings)) {
    return {
      valid: false,
      errorCode: "INVALID_QUALITY",
      message: "The export quality settings are invalid.",
    };
  }

  const policy = FORMAT_POLICIES[settings.format];
  if (policy.lossless) {
    if (
      settings.bitrate !== undefined ||
      (settings.qualityPreset !== undefined &&
        settings.qualityPreset !== "lossless")
    ) {
      return {
        valid: false,
        errorCode: "INVALID_QUALITY",
        message: "This format only supports lossless quality.",
      };
    }
  } else if (
    (settings.bitrate !== undefined &&
      !(LOSSY_BITRATES as readonly string[]).includes(settings.bitrate)) ||
    (settings.qualityPreset !== undefined &&
      !(LOSSY_QUALITY_PRESETS as readonly string[]).includes(
        settings.qualityPreset,
      ))
  ) {
    return {
      valid: false,
      errorCode: "INVALID_QUALITY",
      message: "The selected bitrate is not supported.",
    };
  }

  return {
    valid: true,
    value: {
      ...settings,
      extension: policy.extension,
      contentType: policy.contentType,
    },
  };
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
