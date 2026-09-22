import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedisJobStore,
  DuplicateActiveJobError,
  type ExportJobRecord,
  type JobStore,
} from "./_lib/jobs.js";
import { createRedisExportQueue, type ExportQueue } from "./_lib/queue.js";
import {
  parseExportRequest,
  validateEditOperations,
  validateExportSettings,
  type ExportRequest,
} from "./_lib/export.validation.js";
import {
  lookupPrivateBlob,
  type BlobAccessContext,
  type PrivateBlobLookup,
} from "./_lib/blob.js";
import { toExportApiError, toUnexpectedExportError } from "./_lib/errors.js";

const DEFAULT_OUTPUT_RETENTION_SECONDS = 24 * 60 * 60;

export interface ExportRouteDependencies {
  jobStore: JobStore;
  queue: ExportQueue;
  lookupBlob: (context: BlobAccessContext) => Promise<PrivateBlobLookup>;
  createJobId?: () => string;
  now?: () => Date;
}

function getSessionId(request: VercelRequest): string | null {
  const sessionId = request.headers["x-session-id"];
  return typeof sessionId === "string" && sessionId.trim()
    ? sessionId.trim()
    : null;
}

function getRetentionDeadline(now: Date): Date {
  const configured = Number(process.env.AUDIO_OUTPUT_RETENTION_SECONDS);
  const seconds =
    Number.isSafeInteger(configured) && configured > 0
      ? configured
      : DEFAULT_OUTPUT_RETENTION_SECONDS;
  return new Date(now.getTime() + seconds * 1000);
}

function createQueuedJob(
  request: ExportRequest,
  sessionId: string,
  now: Date,
  createJobId: () => string,
): ExportJobRecord {
  return {
    jobId: createJobId(),
    projectId: request.projectId,
    sessionId,
    sourceBlobKey: request.sourceBlobKey,
    sourceRevision: request.sourceRevision,
    operations: request.operations,
    settings: { ...request.settings },
    status: "queued",
    stage: "queued",
    progressPercent: 0,
    revision: 0,
    leaseExpiresAt: null,
    retentionDeadline: getRetentionDeadline(now),
    outputBlobKey: null,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createExportHandler(dependencies: ExportRouteDependencies) {
  return async function exportHandler(
    request: VercelRequest,
    response: VercelResponse,
  ) {
    if (request.method !== "POST") {
      return response.status(405).json({ error: "Method not allowed" });
    }

    const sessionId = getSessionId(request);
    if (!sessionId) {
      const error = toExportApiError("UNAUTHORIZED");
      return response.status(error.status).json({
        errorCode: error.errorCode,
        error: error.message,
      });
    }

    const parsed = parseExportRequest(request.body);
    if (!parsed.valid) {
      return response.status(400).json({
        errorCode: parsed.errorCode,
        error: parsed.message,
      });
    }

    const project = await dependencies.jobStore.getProjectSession(
      parsed.value.projectId,
      sessionId,
    );
    if (!project) {
      const error = toExportApiError("UNAUTHORIZED");
      return response.status(error.status).json({
        errorCode: error.errorCode,
        error: error.message,
      });
    }

    if (
      project.sourceBlobKey !== parsed.value.sourceBlobKey ||
      project.sourceRevision !== parsed.value.sourceRevision
    ) {
      const error = toExportApiError("SOURCE_NOT_FOUND");
      return response.status(error.status).json({
        errorCode: error.errorCode,
        error: error.message,
      });
    }

    const operations = validateEditOperations(
      parsed.value.operations,
      project.durationSeconds,
    );
    if (!operations.valid) {
      return response.status(400).json({
        errorCode: operations.errorCode,
        error: operations.message,
      });
    }

    const settings = validateExportSettings(parsed.value.settings);
    if (!settings.valid) {
      return response.status(400).json({
        errorCode: settings.errorCode,
        error: settings.message,
      });
    }

    try {
      await dependencies.lookupBlob({
        projectId: parsed.value.projectId,
        sessionId,
        reference: {
          projectId: parsed.value.projectId,
          sessionId,
          key: parsed.value.sourceBlobKey,
          kind: "source",
        },
      });

      const now = dependencies.now?.() ?? new Date();
      const job = createQueuedJob(
        {
          ...parsed.value,
          operations: operations.value,
          settings: settings.value,
        },
        sessionId,
        now,
        dependencies.createJobId ?? randomUUID,
      );
      await dependencies.jobStore.createExportJob(job);
      try {
        await dependencies.queue.dispatch(job.jobId);
      } catch {
        await dependencies.jobStore.removeQueued?.(
          job.jobId,
          job.projectId,
        );
        const error = toExportApiError("QUEUE_UNAVAILABLE");
        return response.status(error.status).json({
          errorCode: error.errorCode,
          error: error.message,
        });
      }

      return response.status(200).json({
        jobId: job.jobId,
        status: job.status,
        stage: job.stage,
        progressPercent: job.progressPercent,
        message: "Preparing export",
      });
    } 
    catch (error) {
      const errorE = toUnexpectedExportError();
      if (error instanceof DuplicateActiveJobError) {
        const duplicate = toExportApiError("DUPLICATE_ACTIVE_JOB");
        return response.status(duplicate.status).json({
          errorCode: duplicate.errorCode,
          error: duplicate.message,
        });
      }

      return response.status(errorE.status).json({
        errorCode: errorE.errorCode,
        error: errorE.message,
      });
    }
  };
}

let defaultHandler: ReturnType<typeof createExportHandler> | null = null;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  defaultHandler ??= createExportHandler({
    jobStore: createRedisJobStore(),
    queue: createRedisExportQueue(),
    lookupBlob: (context) => lookupPrivateBlob(context),
  });
  return defaultHandler(request, response);
}
