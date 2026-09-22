import { describe, expect, it } from "vitest";
import {
  RedisJobStore,
  type ExportJobRecord,
  type ProjectSessionRecord,
} from "../../api/_lib/jobs.js";

class FakeRedisClient {
  private readonly values = new Map<string, string>();

  async set(
    key: string,
    value: string,
    options?: { NX?: boolean; EXAT?: number },
  ): Promise<"OK" | null> {
    if (options?.NX && this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }

  async watch(): Promise<void> {}

  async unwatch(): Promise<void> {}

  multi() {
    const operations: Array<() => Promise<unknown>> = [];
    const transaction = {
      set: (
        key: string,
        value: string,
        options?: { NX?: boolean; EXAT?: number },
      ) => {
        operations.push(() => this.set(key, value, options));
        return transaction;
      },
      del: (key: string) => {
        operations.push(() => this.del(key));
        return transaction;
      },
      exec: async () => {
        const results: unknown[] = [];
        for (const operation of operations) results.push(await operation());
        return results;
      },
    };
    return transaction;
  }

  async *scanIterator(options: { MATCH: string }) {
    const prefix = options.MATCH.replace("*", "");
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) yield key;
    }
  }
}

const session: ProjectSessionRecord = {
  projectId: "project_123",
  sessionId: "session_456",
  sourceBlobKey: "audio/source/project_123/session_456/example.wav",
  sourceRevision: 4,
  durationSeconds: 30,
  updatedAt: new Date("2026-09-20T00:00:00.000Z"),
};

function makeJob(overrides: Partial<ExportJobRecord> = {}): ExportJobRecord {
  const timestamp = new Date("2026-09-20T00:00:00.000Z");
  return {
    jobId: "job_456",
    projectId: session.projectId,
    sessionId: session.sessionId,
    sourceBlobKey: session.sourceBlobKey,
    sourceRevision: session.sourceRevision,
    operations: [],
    settings: { format: "wav" },
    status: "running",
    stage: "rendering",
    progressPercent: 50,
    revision: 1,
    leaseExpiresAt: new Date("2026-09-20T00:01:00.000Z"),
    retentionDeadline: new Date("2026-09-21T00:00:00.000Z"),
    outputBlobKey: null,
    errorCode: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("RedisJobStore recovery behavior", () => {
  it("fails a job when the worker lease expires", async () => {
    const store = new RedisJobStore(new FakeRedisClient() as never);
    await store.createProjectSession(session);
    await store.createExportJob(makeJob());

    const expired = await store.expireLeases(new Date("2026-09-20T00:02:00.000Z"));

    expect(expired).toBe(1);
    expect((await store.get("job_456"))?.status).toBe("failed");
    expect((await store.get("job_456"))?.errorCode).toBe("PROCESSING_FAILED");
  });

  it("does not overwrite a successful job with a stale completion update", async () => {
    const store = new RedisJobStore(new FakeRedisClient() as never);
    await store.createProjectSession(session);
    await store.createExportJob(makeJob({ status: "succeeded", stage: "succeeded", progressPercent: 100 }));

    const updated = await store.completeSuccess("job_456", 1, "audio/export/final.mp3", new Date("2026-09-21T00:00:00.000Z"));

    expect(updated?.status).toBe("succeeded");
    expect(updated?.outputBlobKey).toBe("audio/export/final.mp3");
  });

  it("keeps a failed terminal job from being changed back to a running state", async () => {
    const store = new RedisJobStore(new FakeRedisClient() as never);
    await store.createProjectSession(session);
    await store.createExportJob(makeJob({ status: "failed", stage: "failed", progressPercent: 100 }));

    const updated = await store.updateProgress("job_456", 1, "rendering", 75);

    expect(updated?.status).toBe("failed");
    expect(updated?.progressPercent).toBe(100);
  });
});
