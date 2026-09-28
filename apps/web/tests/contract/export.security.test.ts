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

function makeRequest(body: unknown = validRequest, session = sessionId) {
  return {
    method: "POST",
    headers: { "x-session-id": session },
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

describe("POST /api/exports security regression", () => {
  it("rejects a foreign blob key before job creation", async () => {
    const dependencies = makeDependencies({
      jobStore: {
        getProjectSession: vi.fn(async () => ({
          ...project,
          sourceBlobKey: "audio/source/project_123/session_456/other.wav",
        })),
      } as unknown as JobStore,
    });
    const response = makeResponse();

    await createExportHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ errorCode: "SOURCE_NOT_FOUND" });
    expect(dependencies.queue.dispatch).not.toHaveBeenCalled();
  });

  it("rejects traversal-like keys and never enqueues a job", async () => {
    const dependencies = makeDependencies();
    const response = makeResponse();

    await createExportHandler(
      dependencies,
    )(
      makeRequest({
        ...validRequest,
        sourceBlobKey: "../../audio/source/project_123/session_456/example.wav",
      }),
      response as never,
    );

    expect(response.statusCode).toBe(400);
    expect(dependencies.jobStore.createExportJob).not.toHaveBeenCalled();
    expect(dependencies.queue.dispatch).not.toHaveBeenCalled();
  });

  it("rejects missing session binding and never reveals the project exists", async () => {
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

  it("redacts secrets in queue or storage failures", async () => {
    const dependencies = makeDependencies({
      queue: {
        dispatch: vi.fn(async () => {
          throw new Error("redis://secret token in queue failure");
        }),
      },
    });
    const response = makeResponse();

    await createExportHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({ errorCode: "QUEUE_UNAVAILABLE" });
    expect(JSON.stringify(response.body)).not.toMatch(/secret|redis:|token/i);
  });

  it("blocks duplicate active export attempts before any second queue dispatch", async () => {
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
    expect(response.body).toMatchObject({ errorCode: "DUPLICATE_ACTIVE_JOB" });
    expect(dependencies.queue.dispatch).not.toHaveBeenCalled();
  });
});
