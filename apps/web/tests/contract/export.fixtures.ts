import type { ExportStatusResponse } from "../../api/_lib/export.validation.js";
import type { OwnedBlobReference } from "../../api/_lib/blob.js";

export const validPreserveFormatRequest = {
  projectId: "project_123",
  sourceRevision: 4,
  sourceBlobKey: "audio/source/project_123/session_456/example.wav",
  operations: [
    {
      id: "op_1",
      type: "trim",
      params: { startTime: 2, endTime: 18 },
      createdAt: 1_728_000_000_000,
    },
  ],
  settings: { format: "wav" },
} as const;

export const invalidOperationRequest = {
  ...validPreserveFormatRequest,
  operations: [
    {
      id: "op_invalid",
      type: "trim",
      params: { startTime: Number.NaN, endTime: 18 },
      createdAt: 1_728_000_000_000,
    },
  ],
} as const;

export const unsupportedFormatRequest = {
  ...validPreserveFormatRequest,
  settings: { format: "m4a" },
} as const;

export const invalidQualityRequest = {
  ...validPreserveFormatRequest,
  settings: { format: "wav", bitrate: "192k" },
} as const;

export const unauthorizedObjectReference: OwnedBlobReference = {
  projectId: "project_other",
  sessionId: "session_other",
  key: "audio/source/project_other/session_other/example.wav",
  kind: "source",
};

export const queuedJobResponse: ExportStatusResponse = {
  jobId: "job_456",
  status: "queued",
  stage: "queued",
  progressPercent: 0,
  message: "Preparing export",
  downloadUrl: null,
  errorCode: null,
  error: null,
};

export const succeededJobResponse: ExportStatusResponse = {
  jobId: "job_456",
  status: "succeeded",
  stage: "succeeded",
  progressPercent: 100,
  message: "Export complete",
  downloadUrl: "short-lived-signed-url",
  errorCode: null,
  error: null,
};

export const failedJobResponse: ExportStatusResponse = {
  jobId: "job_456",
  status: "failed",
  stage: "failed",
  progressPercent: 100,
  message: "Audio conversion failed",
  errorCode: "UNSUPPORTED_CODEC",
  error: "This audio could not be exported with the selected settings.",
};
