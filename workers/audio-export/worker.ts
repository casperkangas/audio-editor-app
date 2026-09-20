import type {
  ExportJobRecord,
  JobStore,
} from "../../apps/web/api/_lib/jobs.js";

export interface ExportWorkerMessage {
  jobId: string;
}

export class ExportWorkerMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportWorkerMessageError";
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

export function createExportWorker(jobStore: Pick<JobStore, "get">) {
  return (message: unknown): Promise<ExportJobRecord> =>
    loadExportJob(message, jobStore);
}
