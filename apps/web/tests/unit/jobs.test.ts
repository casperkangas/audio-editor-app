import { describe, expect, it } from "vitest";
import {
  DuplicateActiveJobError,
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

  async watch(_key: string): Promise<void> {}

  async unwatch(): Promise<void> {}

  multi() {
    const operations: Array<() => Promise<unknown>> = [];
    return {
      set: (
        key: string,
        value: string,
        options?: { NX?: boolean; EXAT?: number },
      ) => {
        operations.push(() => this.set(key, value, options));
        return this;
      },
      del: (key: string) => {
        operations.push(() => this.del(key));
        return this;
      },
      exec: async () => {
        const results: unknown[] = [];
        for (const operation of operations) results.push(await operation());
        return results;
      },
    };
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
    status: "queued",
    stage: "queued",
    progressPercent: 0,
    revision: 0,
    leaseExpiresAt: null,
    retentionDeadline: new Date("2026-09-21T00:00:00.000Z"),
    outputBlobKey: null,
    errorCode: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

async function createStore(job = makeJob()) {
  const store = new RedisJobStore(new FakeRedisClient() as never);
  await store.createProjectSession(session);
  await store.createExportJob(job);
  return store;
}

describe("RedisJobStore state transitions", () => {
  it("claims a queued job and advances its revision", async () => {
    const store = await createStore();
    const claimed = await store.claim(
      "job_456",
      0,
      new Date("2026-09-20T00:05:00.000Z"),
    );

    expect(claimed).toMatchObject({
      status: "running",
      stage: "validating",
      revision: 1,
    });
  });

  it("never decreases progress", async () => {
    const store = await createStore(makeJob({ progressPercent: 40 }));
    const updated = await store.updateProgress("job_456", 0, "rendering", 20);

    expect(updated?.progressPercent).toBe(40);
  });

  it("protects terminal jobs from later updates", async () => {
    const store = await createStore(
      makeJob({ status: "succeeded", stage: "succeeded", progressPercent: 100 }),
    );
    const updated = await store.updateProgress("job_456", 0, "rendering", 20);

    expect(updated?.status).toBe("succeeded");
    expect(updated?.progressPercent).toBe(100);
  });

  it("expires running jobs whose lease has elapsed", async () => {
    const store = await createStore(
      makeJob({
        status: "running",
        stage: "rendering",
        revision: 1,
        leaseExpiresAt: new Date("2026-09-20T00:01:00.000Z"),
      }),
    );
    const expired = await store.expireLeases(
      new Date("2026-09-20T00:02:00.000Z"),
    );

    expect(expired).toBe(1);
    expect((await store.get("job_456"))?.status).toBe("failed");
  });

  it("rejects a second active export for the same project", async () => {
    const store = await createStore();

    await expect(store.createExportJob(makeJob({ jobId: "job_789" }))).rejects.toBeInstanceOf(
      DuplicateActiveJobError,
    );
  });
});