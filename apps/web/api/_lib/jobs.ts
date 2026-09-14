export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobStage =
  | "queued"
  | "validating"
  | "rendering"
  | "finalizing"
  | "succeeded"
  | "failed";

export interface ExportJobRecord {
  jobId: string;
  projectId: string;
  sessionId: string;
  sourceBlobKey: string;
  sourceRevision: number;
  operations: readonly unknown[];
  settings: Readonly<Record<string, unknown>>;
  status: JobStatus;
  stage: JobStage;
  progressPercent: number;
  revision: number;
  leaseExpiresAt: Date | null;
  retentionDeadline: Date;
  outputBlobKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type JobUpdate = Partial<
  Pick<
    ExportJobRecord,
    | "status"
    | "stage"
    | "progressPercent"
    | "leaseExpiresAt"
    | "retentionDeadline"
    | "outputBlobKey"
    | "errorCode"
    | "errorMessage"
  >
>;

export interface JobStore {
  create(job: ExportJobRecord): Promise<void>;
  get(jobId: string): Promise<ExportJobRecord | null>;
  findActiveByProject(projectId: string): Promise<ExportJobRecord | null>;
  claim(
    jobId: string,
    expectedRevision: number,
    leaseExpiresAt: Date,
  ): Promise<ExportJobRecord | null>;
  compareAndSet(
    jobId: string,
    expectedRevision: number,
    update: JobUpdate,
  ): Promise<ExportJobRecord | null>;
  expireLeases(now: Date): Promise<number>;
}
