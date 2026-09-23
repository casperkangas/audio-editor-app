import { createClient } from "redis";

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

export interface ProjectSessionRecord {
  projectId: string;
  sessionId: string;
  sourceBlobKey: string;
  sourceRevision: number;
  durationSeconds: number;
  updatedAt: Date;
}

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

export interface WorkerFailure {
  errorCode: string;
  errorMessage: string;
}

export interface JobStore {
  create(job: ExportJobRecord): Promise<void>;
  createProjectSession(project: ProjectSessionRecord): Promise<void>;
  createExportJob(job: ExportJobRecord): Promise<void>;
  removeQueued?(jobId: string, projectId: string): Promise<void>;
  get(jobId: string): Promise<ExportJobRecord | null>;
  getProjectSession(
    projectId: string,
    sessionId: string,
  ): Promise<ProjectSessionRecord | null>;
  findActiveByProject(projectId: string): Promise<ExportJobRecord | null>;
  claim(
    jobId: string,
    expectedRevision: number,
    leaseExpiresAt: Date,
  ): Promise<ExportJobRecord | null>;
  updateProgress(
    jobId: string,
    expectedRevision: number,
    stage: JobStage,
    progressPercent: number,
  ): Promise<ExportJobRecord | null>;
  completeSuccess(
    jobId: string,
    expectedRevision: number,
    outputBlobKey: string,
    retentionDeadline: Date,
  ): Promise<ExportJobRecord | null>;
  completeFailure(
    jobId: string,
    expectedRevision: number,
    failure: WorkerFailure,
  ): Promise<ExportJobRecord | null>;
  compareAndSet(
    jobId: string,
    expectedRevision: number,
    update: JobUpdate,
  ): Promise<ExportJobRecord | null>;
  expireLeases(now: Date): Promise<number>;
}

type RedisClient = ReturnType<typeof createClient>;

const PROJECT_PREFIX = "audio:project:";
const JOB_PREFIX = "audio:export-job:";
const ACTIVE_PREFIX = "audio:active-export:";

function projectKey(projectId: string): string {
  return `${PROJECT_PREFIX}${projectId}`;
}

function jobKey(jobId: string): string {
  return `${JOB_PREFIX}${jobId}`;
}

function activeKey(projectId: string): string {
  return `${ACTIVE_PREFIX}${projectId}`;
}

function serializeProject(project: ProjectSessionRecord): string {
  return JSON.stringify({
    ...project,
    updatedAt: project.updatedAt.toISOString(),
  });
}

function deserializeProject(value: string): ProjectSessionRecord {
  const project = JSON.parse(value) as Omit<
    ProjectSessionRecord,
    "updatedAt"
  > & {
    updatedAt: string;
  };
  return { ...project, updatedAt: new Date(project.updatedAt) };
}

function serializeJob(job: ExportJobRecord): string {
  return JSON.stringify({
    ...job,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
    retentionDeadline: job.retentionDeadline.toISOString(),
  });
}

function deserializeJob(value: string): ExportJobRecord {
  const job = JSON.parse(value) as Omit<
    ExportJobRecord,
    "createdAt" | "updatedAt" | "leaseExpiresAt" | "retentionDeadline"
  > & {
    createdAt: string;
    updatedAt: string;
    leaseExpiresAt: string | null;
    retentionDeadline: string;
  };

  return {
    ...job,
    createdAt: new Date(job.createdAt),
    updatedAt: new Date(job.updatedAt),
    leaseExpiresAt: job.leaseExpiresAt ? new Date(job.leaseExpiresAt) : null,
    retentionDeadline: new Date(job.retentionDeadline),
  };
}

function isTerminal(status: JobStatus): boolean {
  return (
    status === "succeeded" || status === "failed" || status === "cancelled"
  );
}

function applyUpdate(job: ExportJobRecord, update: JobUpdate): ExportJobRecord {
  if (isTerminal(job.status)) return job;

  return {
    ...job,
    ...update,
    progressPercent: Math.max(
      job.progressPercent,
      Math.min(100, update.progressPercent ?? job.progressPercent),
    ),
    revision: job.revision + 1,
    updatedAt: new Date(),
  };
}

export class RedisJobStore implements JobStore {
  constructor(private readonly client: RedisClient) {}

  async createProjectSession(project: ProjectSessionRecord): Promise<void> {
    await this.client.set(
      projectKey(project.projectId),
      serializeProject(project),
    );
  }

  async getProjectSession(
    projectId: string,
    sessionId: string,
  ): Promise<ProjectSessionRecord | null> {
    const value = await this.client.get(projectKey(projectId));
    if (!value) return null;

    const project = deserializeProject(value);
    return project.sessionId === sessionId ? project : null;
  }

  async create(job: ExportJobRecord): Promise<void> {
    const created = await this.client.set(
      jobKey(job.jobId),
      serializeJob(job),
      {
        NX: true,
      },
    );
    if (created !== "OK") throw new Error("Export job already exists");
  }

  async createExportJob(job: ExportJobRecord): Promise<void> {
    const project = await this.getProjectSession(job.projectId, job.sessionId);
    if (
      !project ||
      project.sourceBlobKey !== job.sourceBlobKey ||
      project.sourceRevision !== job.sourceRevision
    ) {
      throw new Error("Project ownership mismatch");
    }

    const activeJobKey = activeKey(job.projectId);
    await this.client.watch(activeJobKey);
    if (await this.client.get(activeJobKey)) {
      await this.client.unwatch();
      throw new DuplicateActiveJobError();
    }

    const result = await this.client
      .multi()
      .set(jobKey(job.jobId), serializeJob(job), { NX: true })
      .set(activeJobKey, job.jobId, {
        EXAT: Math.floor(job.retentionDeadline.getTime() / 1000),
      })
      .exec();
    if (!result) {
      throw new DuplicateActiveJobError();
    }
  }

  async removeQueued(jobId: string, projectId: string): Promise<void> {
    const key = jobKey(jobId);
    await this.client.watch(key);
    const value = await this.client.get(key);
    if (!value) {
      await this.client.unwatch();
      return;
    }

    const job = deserializeJob(value);
    if (job.projectId !== projectId || job.status !== "queued") {
      await this.client.unwatch();
      return;
    }

    await this.client.multi().del(key).del(activeKey(projectId)).exec();
  }

  async get(jobId: string): Promise<ExportJobRecord | null> {
    const value = await this.client.get(jobKey(jobId));
    return value ? deserializeJob(value) : null;
  }

  async findActiveByProject(
    projectId: string,
  ): Promise<ExportJobRecord | null> {
    const jobId = await this.client.get(activeKey(projectId));
    if (!jobId) return null;

    const job = await this.get(jobId);
    return job && !isTerminal(job.status) ? job : null;
  }

  async claim(
    jobId: string,
    expectedRevision: number,
    leaseExpiresAt: Date,
  ): Promise<ExportJobRecord | null> {
    return this.compareAndSet(jobId, expectedRevision, {
      status: "running",
      stage: "validating",
      leaseExpiresAt,
    });
  }

  async updateProgress(
    jobId: string,
    expectedRevision: number,
    stage: JobStage,
    progressPercent: number,
  ): Promise<ExportJobRecord | null> {
    return this.compareAndSet(jobId, expectedRevision, {
      status: "running",
      stage,
      progressPercent,
    });
  }

  async completeSuccess(
    jobId: string,
    expectedRevision: number,
    outputBlobKey: string,
    retentionDeadline: Date,
  ): Promise<ExportJobRecord | null> {
    return this.compareAndSet(jobId, expectedRevision, {
      status: "succeeded",
      stage: "succeeded",
      progressPercent: 100,
      leaseExpiresAt: null,
      outputBlobKey,
      retentionDeadline,
      errorCode: null,
      errorMessage: null,
    });
  }

  async completeFailure(
    jobId: string,
    expectedRevision: number,
    failure: WorkerFailure,
  ): Promise<ExportJobRecord | null> {
    return this.compareAndSet(jobId, expectedRevision, {
      status: "failed",
      stage: "failed",
      progressPercent: 100,
      leaseExpiresAt: null,
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
    });
  }

  async compareAndSet(
    jobId: string,
    expectedRevision: number,
    update: JobUpdate,
  ): Promise<ExportJobRecord | null> {
    const key = jobKey(jobId);
    await this.client.watch(key);
    const currentValue = await this.client.get(key);
    if (!currentValue) {
      await this.client.unwatch();
      return null;
    }

    const current = deserializeJob(currentValue);
    if (current.revision !== expectedRevision) {
      await this.client.unwatch();
      return null;
    }

    const updated = applyUpdate(current, update);
    const result = await this.client
      .multi()
      .set(key, serializeJob(updated))
      .exec();
    if (result && isTerminal(updated.status)) {
      await this.client.del(activeKey(updated.projectId));
    }
    return result ? updated : null;
  }

  async expireLeases(now: Date): Promise<number> {
    let expired = 0;
    for await (const rawKey of this.client.scanIterator({
      MATCH: `${JOB_PREFIX}*`,
    })) {
      const key = String(rawKey);
      const value = await this.client.get(key);
      if (!value) continue;

      const job = deserializeJob(value);
      if (
        job.status === "running" &&
        job.leaseExpiresAt !== null &&
        job.leaseExpiresAt <= now
      ) {
        const updated = await this.compareAndSet(job.jobId, job.revision, {
          status: "failed",
          stage: "failed",
          progressPercent: 100,
          errorCode: "PROCESSING_FAILED",
          errorMessage: "The export worker lease expired.",
          leaseExpiresAt: null,
        });
        if (updated) expired += 1;
      }
    }
    return expired;
  }
}

export class DuplicateActiveJobError extends Error {
  constructor() {
    super("An export is already in progress for this project.");
    this.name = "DuplicateActiveJobError";
  }
}

export function createRedisJobStore(
  url = process.env.REDIS_URL,
): RedisJobStore {
  if (!url) throw new Error("REDIS_URL is required");

  const client = createClient({ url });
  client.on("error", (err) => console.warn("Redis JobStore Error:", err));
  void client.connect();
  return new RedisJobStore(client as RedisClient);
}
