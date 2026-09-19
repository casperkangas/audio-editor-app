import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedisJobStore,
  type ExportJobRecord,
  type JobStore,
} from "../_lib/jobs.js";
import {
  createPrivateDownloadUrl,
  type BlobAccessContext,
} from "../_lib/blob.js";
import {
  isExportErrorCode,
  toExportApiError,
  toUnexpectedExportError,
} from "../_lib/errors.js";
import type { ExportStatusResponse } from "../_lib/export.validation.js";

export interface JobStatusRouteDependencies {
  jobStore: JobStore;
  createDownloadUrl: (context: BlobAccessContext) => Promise<string>;
}

function getSessionId(request: VercelRequest): string | null {
  const sessionId = request.headers["x-session-id"];
  return typeof sessionId === "string" && sessionId.trim()
    ? sessionId.trim()
    : null;
}

function getJobId(request: VercelRequest): string | null {
  const jobId = request.query.jobId;
  if (Array.isArray(jobId)) return jobId[0] ?? null;
  return typeof jobId === "string" && jobId.trim() ? jobId.trim() : null;
}

function getStageMessage(job: ExportJobRecord): string {
  if (job.status === "queued") return "Preparing export";
  if (job.status === "running") {
    if (job.stage === "validating") return "Validating audio";
    if (job.stage === "rendering") return "Rendering audio";
    if (job.stage === "finalizing") return "Finalizing export";
  }
  if (job.status === "succeeded") return "Export complete";
  if (job.status === "cancelled") return "Export cancelled";
  return "Audio conversion failed";
}

function getSafeError(job: ExportJobRecord): {
  errorCode: ExportStatusResponse["errorCode"];
  error: string;
} | null {
  if (job.status !== "failed") return null;

  if (isExportErrorCode(job.errorCode)) {
    const mapped = toExportApiError(job.errorCode);
    return { errorCode: mapped.errorCode, error: mapped.message };
  }

  const fallback = toUnexpectedExportError();
  return { errorCode: fallback.errorCode, error: fallback.message };
}

function toStatusResponse(
  job: ExportJobRecord,
  downloadUrl: string | null,
): ExportStatusResponse {
  const safeError = getSafeError(job);
  return {
    jobId: job.jobId,
    status: job.status,
    stage: job.stage,
    progressPercent: Math.max(0, Math.min(100, job.progressPercent)),
    message: getStageMessage(job),
    downloadUrl,
    errorCode: safeError?.errorCode ?? null,
    error: safeError?.error ?? null,
  };
}

export function createJobStatusHandler(
  dependencies: JobStatusRouteDependencies,
) {
  return async function jobStatusHandler(
    request: VercelRequest,
    response: VercelResponse,
  ) {
    if (request.method !== "GET") {
      return response.status(405).json({ error: "Method not allowed" });
    }

    const sessionId = getSessionId(request);
    const jobId = getJobId(request);
    if (!sessionId || !jobId) {
      return response.status(404).json({ error: "Export job not found" });
    }

    const job = await dependencies.jobStore.get(jobId);
    if (!job || job.sessionId !== sessionId) {
      return response.status(404).json({ error: "Export job not found" });
    }

    try {
      let downloadUrl: string | null = null;
      if (job.status === "succeeded" && job.outputBlobKey) {
        downloadUrl = await dependencies.createDownloadUrl({
          projectId: job.projectId,
          sessionId,
          reference: {
            projectId: job.projectId,
            sessionId,
            key: job.outputBlobKey,
            kind: "export",
          },
        });
      }

      return response.status(200).json(toStatusResponse(job, downloadUrl));
    } catch {
      const error = toUnexpectedExportError();
      return response.status(error.status).json({
        errorCode: error.errorCode,
        error: error.message,
      });
    }
  };
}

let defaultHandler: ReturnType<typeof createJobStatusHandler> | null = null;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  defaultHandler ??= createJobStatusHandler({
    jobStore: createRedisJobStore(),
    createDownloadUrl: (context) => createPrivateDownloadUrl(context),
  });
  return defaultHandler(request, response);
}
