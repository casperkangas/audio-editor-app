import type {
  ExportJobRecord,
  JobStore,
  JobStage,
  WorkerFailure,
} from "../../apps/web/api/_lib/jobs.js";
import {
  EXPORT_ERROR_MESSAGES,
  type ExportErrorCode,
  validateExportSettings,
  type ExportOperationSnapshot,
} from "../../apps/web/api/_lib/export.validation.js";
import {
  finalizeRenderedOutput,
  type ProbeCommand,
  createSourceWorkspace,
  probeAudioFile,
  buildFfmpegArgs,
  WorkerSourceError,
  AudioProbeError,
} from "./ffmpeg.js";
import { cleanupWorkspace, cleanupFailedOutput } from "./cleanup.js";
import { createRenderPlan } from "./render-plan.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export interface ExportWorkerMessage {
  jobId: string;
}

export class ExportWorkerMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportWorkerMessageError";
  }
}

const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_OUTPUT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface WorkerOrchestratorOptions {
  readonly leaseDurationMs?: number;
  readonly outputRetentionMs?: number;
  readonly now?: () => Date;
}

export class WorkerLifecycleError extends Error {
  readonly errorCode: ExportErrorCode | "STALE_JOB";

  constructor(errorCode: ExportErrorCode | "STALE_JOB", message: string) {
    super(message);
    this.name = "WorkerLifecycleError";
    this.errorCode = errorCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonMessage(message: string): unknown {
  try {
    return JSON.parse(message) as unknown;
  } catch {
    throw new ExportWorkerMessageError("Worker message must be valid JSON.");
  }
}

export function parseExportWorkerMessage(
  message: unknown,
): ExportWorkerMessage {
  const candidate =
    typeof message === "string" ? parseJsonMessage(message) : message;

  if (
    !isRecord(candidate) ||
    Object.keys(candidate).length !== 1 ||
    typeof candidate.jobId !== "string" ||
    candidate.jobId.trim().length === 0
  ) {
    throw new ExportWorkerMessageError(
      "Worker message must contain only a non-empty string jobId.",
    );
  }

  return { jobId: candidate.jobId };
}

export async function loadExportJob(
  message: unknown,
  jobStore: Pick<JobStore, "get">,
): Promise<ExportJobRecord> {
  const { jobId } = parseExportWorkerMessage(message);
  const job = await jobStore.get(jobId);

  if (!job) {
    throw new ExportWorkerMessageError("Export job was not found.");
  }

  return job;
}

export function createExportWorker(
  jobStore: JobStore,
  options?: WorkerOrchestratorOptions,
) {
  const orchestrator = createWorkerOrchestrator(jobStore, options);

  return async (
    message: unknown,
    token?: string,
  ): Promise<ExportJobRecord | null> => {
    let job = await orchestrator.claim(message);
    if (!job) return null;

    let workspace: import("./ffmpeg.js").TemporaryAudioWorkspace | null = null;
    let leaseInterval: NodeJS.Timeout | null = null;

    try {
      const leaseDurationMs = options?.leaseDurationMs ?? 5 * 60 * 1000;
      leaseInterval = setInterval(
        () => {
          orchestrator.renewLease(job!).then(
            (renewed) => {
              job = renewed;
            },
            (err) => {
              console.error("Worker lease renewal failed:", err);
            },
          );
        },
        Math.max(1000, leaseDurationMs / 2),
      );

      job = await orchestrator.progress(job, "validating", 10);
      workspace = await createSourceWorkspace(job, token);
      const probe = await probeAudioFile(workspace.sourcePath);
      const plan = createRenderPlan(
        job.operations as ExportOperationSnapshot[],
        probe.durationSeconds,
      );

      const settingsResult = validateExportSettings(job.settings);
      if (!settingsResult.valid) {
        throw new WorkerSourceError(settingsResult.message);
      }

      const outputPath = join(
        workspace.directoryPath,
        `output.${settingsResult.value.extension}`,
      );
      const args = buildFfmpegArgs(
        workspace.sourcePath,
        outputPath,
        plan,
        settingsResult.value,
      );

      job = await orchestrator.progress(job, "rendering", 50);

      try {
        await execFileAsync("ffmpeg", args as string[]);
      } catch (err) {
        throw new WorkerSourceError("FFmpeg execution failed");
      }

      job = await orchestrator.progress(job, "finalizing", 90);
      job = await finalizeWorkerOutput(job, outputPath, orchestrator, token);

      return job;
    } catch (error) {
      if (
        job &&
        job.status !== "succeeded" &&
        job.status !== "failed" &&
        job.status !== "cancelled"
      ) {
        try {
          job = await orchestrator.fail(job, error);
        } catch (failErr) {
          console.error(
            "Worker failed to transition job to terminal state:",
            failErr,
          );
        }
      }
      return job;
    } finally {
      if (leaseInterval) clearInterval(leaseInterval);
      await cleanupWorkspace(workspace);
    }
  };
}

function assertPositiveDuration(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new WorkerLifecycleError(
      "INVALID_REQUEST",
      `The worker ${name} is invalid.`,
    );
  }
}

function assertProgress(progressPercent: number): void {
  if (
    !Number.isSafeInteger(progressPercent) ||
    progressPercent < 0 ||
    progressPercent > 100
  ) {
    throw new WorkerLifecycleError(
      "INVALID_REQUEST",
      "Worker progress must be an integer from 0 to 100.",
    );
  }
}

function assertLeaseDuration(leaseDurationMs: number): void {
  assertPositiveDuration(leaseDurationMs, "lease duration");
}

function getNow(now: () => Date): Date {
  const value = now();
  if (Number.isNaN(value.getTime())) {
    throw new WorkerLifecycleError(
      "INVALID_REQUEST",
      "Worker time is invalid.",
    );
  }
  return value;
}

function safeFailure(error: unknown): WorkerFailure {
  if (
    error instanceof WorkerLifecycleError &&
    error.errorCode !== "STALE_JOB"
  ) {
    const errorCode = error.errorCode;
    return {
      errorCode,
      errorMessage: EXPORT_ERROR_MESSAGES[errorCode],
    };
  }

  const errorCode =
    error &&
    typeof error === "object" &&
    "errorCode" in error &&
    typeof error.errorCode === "string" &&
    error.errorCode in EXPORT_ERROR_MESSAGES
      ? (error.errorCode as ExportErrorCode)
      : "PROCESSING_FAILED";

  return {
    errorCode,
    errorMessage: EXPORT_ERROR_MESSAGES[errorCode],
  };
}

export function createWorkerOrchestrator(
  jobStore: JobStore,
  options: WorkerOrchestratorOptions = {},
) {
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  const outputRetentionMs =
    options.outputRetentionMs ?? DEFAULT_OUTPUT_RETENTION_MS;
  const now = options.now ?? (() => new Date());
  assertLeaseDuration(leaseDurationMs);
  assertPositiveDuration(outputRetentionMs, "output retention");

  async function claim(message: unknown): Promise<ExportJobRecord | null> {
    const { jobId } = parseExportWorkerMessage(message);
    const job = await jobStore.get(jobId);
    if (
      !job ||
      job.status === "succeeded" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return null;
    }

    const currentTime = getNow(now);
    if (
      job.status === "running" &&
      job.leaseExpiresAt !== null &&
      job.leaseExpiresAt > currentTime
    ) {
      return null;
    }

    const claimed = await jobStore.claim(
      job.jobId,
      job.revision,
      new Date(currentTime.getTime() + leaseDurationMs),
    );
    if (!claimed) {
      throw new WorkerLifecycleError(
        "STALE_JOB",
        "The export job changed before it could be claimed.",
      );
    }
    return claimed;
  }

  async function renewLease(job: ExportJobRecord): Promise<ExportJobRecord> {
    const currentTime = getNow(now);
    const renewed = await jobStore.compareAndSet(job.jobId, job.revision, {
      leaseExpiresAt: new Date(currentTime.getTime() + leaseDurationMs),
    });
    if (!renewed) {
      throw new WorkerLifecycleError(
        "STALE_JOB",
        "The export job changed before its lease could be renewed.",
      );
    }
    return renewed;
  }

  async function progress(
    job: ExportJobRecord,
    stage: JobStage,
    progressPercent: number,
  ): Promise<ExportJobRecord> {
    assertProgress(progressPercent);
    const updated = await jobStore.updateProgress(
      job.jobId,
      job.revision,
      stage,
      progressPercent,
    );
    if (!updated) {
      throw new WorkerLifecycleError(
        "STALE_JOB",
        "The export job changed before progress could be recorded.",
      );
    }
    return updated;
  }

  async function succeed(
    job: ExportJobRecord,
    outputBlobKey: string,
  ): Promise<ExportJobRecord> {
    if (outputBlobKey.trim().length === 0 || outputBlobKey.includes("\0")) {
      throw new WorkerLifecycleError(
        "INVALID_REQUEST",
        "The output Blob key is invalid.",
      );
    }

    const currentTime = getNow(now);
    const completed = await jobStore.completeSuccess(
      job.jobId,
      job.revision,
      outputBlobKey,
      new Date(currentTime.getTime() + outputRetentionMs),
    );
    if (!completed) {
      throw new WorkerLifecycleError(
        "STALE_JOB",
        "The export job changed before completion could be recorded.",
      );
    }
    return completed;
  }

  async function fail(
    job: ExportJobRecord,
    error: unknown,
  ): Promise<ExportJobRecord> {
    const failure = safeFailure(error);
    const failed = await jobStore.completeFailure(
      job.jobId,
      job.revision,
      failure,
    );
    if (!failed) {
      throw new WorkerLifecycleError(
        "STALE_JOB",
        "The export job changed before failure could be recorded.",
      );
    }
    return failed;
  }

  return { claim, renewLease, progress, succeed, fail };
}

export type WorkerOrchestrator = ReturnType<typeof createWorkerOrchestrator>;

export function finalizeWorkerOutput(
  job: ExportJobRecord,
  outputPath: string,
  orchestrator: Pick<WorkerOrchestrator, "succeed">,
  token?: string,
  runProbe?: ProbeCommand,
): Promise<ExportJobRecord> {
  const safeSucceed = async (
    j: ExportJobRecord,
    outputBlobKey: string,
  ): Promise<ExportJobRecord> => {
    try {
      return await orchestrator.succeed(j, outputBlobKey);
    } catch (error) {
      await cleanupFailedOutput(outputBlobKey, token);
      throw error;
    }
  };

  return finalizeRenderedOutput(job, outputPath, safeSucceed, token, runProbe);
}
