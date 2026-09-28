import { describe, expect, it, vi } from "vitest";
import {
  createExportHandler,
  type ExportRouteDependencies,
} from "../../api/exports.js";
import {
  DuplicateActiveJobError,
  type JobStore,
  type ProjectSessionRecord,
} from "../../api/_lib/jobs.js";
import type { ExportRequest } from "../../api/_lib/export.validation.js";

const sessionId = "session_456";
const projectId = "project_123";
const sourceBlobKey = "audio/source/project_123/session_456/example.wav";

const validRequest: ExportRequest = {
  projectId,
  sourceRevision: 4,
  sourceBlobKey,
  operations: [
    {
      id: "op_1",
      type: "trim",
      params: { startTime: 2, endTime: 18 },
      createdAt: 1_728_000_000_000,
    },
  ],
  settings: { format: "wav" },
};

const project: ProjectSessionRecord = {
  projectId,
  sessionId,
  sourceBlobKey,
  sourceRevision: 4,
  durationSeconds: 30,
  updatedAt: new Date("2026-09-20T00:00:00.000Z"),
};

function makeResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

function makeRequest(body: unknown = validRequest) {
  return {
    method: "POST",
    headers: { "x-session-id": sessionId },
    body,
  } as never;
}

function makeDependencies(
  overrides: Partial<ExportRouteDependencies> = {},
): ExportRouteDependencies {
  const jobStore = {
    getProjectSession: vi.fn(async () => project),
    createExportJob: vi.fn(async () => undefined),
    removeQueued: vi.fn(async () => undefined),
  } as unknown as JobStore;

  return {
    jobStore,
    queue: { dispatch: vi.fn(async () => undefined) },
    lookupBlob: vi.fn(async () => ({ metadata: {} as never, reference: {} as never })),
    createJobId: () => "job_456",
    now: () => new Date("2026-09-20T00:00:00.000Z"),
    ...overrides,
  };
}

describe("POST /api/exports", () => {
  it("queues a valid immutable export request", async () => {
    const dependencies = makeDependencies();
    const response = makeResponse();

    await createExportHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      jobId: "job_456",
      status: "queued",
      stage: "queued",
      progressPercent: 0,
    });
    expect(dependencies.queue.dispatch).toHaveBeenCalledWith("job_456");
  });

  it("rejects malformed payloads before storage or dispatch", async () => {
    const dependencies = makeDependencies();
    const response = makeResponse();

    await createExportHandler(dependencies)(
      makeRequest({ settings: { format: "wav" } }),
      response as never,
    );

    expect(response.statusCode).toBe(400);
    expect(dependencies.jobStore.createExportJob).not.toHaveBeenCalled();
    expect(dependencies.queue.dispatch).not.toHaveBeenCalled();
  });

  it("does not reveal a project that the session cannot access", async () => {
    const dependencies = makeDependencies({
      jobStore: {
        getProjectSession: vi.fn(async () => null),
      } as unknown as JobStore,
    });
    const response = makeResponse();

    await createExportHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ errorCode: "UNAUTHORIZED" });
  });

  it("returns conflict for a second active export", async () => {
    const dependencies = makeDependencies({
      jobStore: {
        getProjectSession: vi.fn(async () => project),
        createExportJob: vi.fn(async () => {
          throw new DuplicateActiveJobError();
        }),
      } as unknown as JobStore,
    });
    const response = makeResponse();

    await createExportHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      errorCode: "DUPLICATE_ACTIVE_JOB",
    });
  });

  it("rolls back a queued job when dispatch fails", async () => {
    const dependencies = makeDependencies({
      queue: {
        dispatch: vi.fn(async () => {
          throw new Error("queue unavailable");
        }),
      },
    });
    const response = makeResponse();

    await createExportHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({ errorCode: "QUEUE_UNAVAILABLE" });
    expect(dependencies.jobStore.removeQueued).toHaveBeenCalledWith(
      "job_456",
      projectId,
    );
  });
});