import { describe, expect, it, vi } from "vitest";
import {
  createExportHandler,
  type ExportRouteDependencies,
} from "../../api/exports.js";
import {
  type JobStore,
  type ProjectSessionRecord,
} from "../../api/_lib/jobs.js";
import type { ExportRequest } from "../../api/_lib/export.validation.js";

const sessionId = "session_456";
const projectId = "project_123";
const sourceBlobKey = "audio/source/project_123/session_456/example.wav";

const conversionRequest: ExportRequest = {
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
  settings: { format: "mp3", bitrate: "192k" },
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

function makeRequest(body: unknown = conversionRequest) {
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

describe("POST /api/exports conversion contract", () => {
  it("persists the validated conversion settings once and dispatches only the job id", async () => {
    const dependencies = makeDependencies();
    const response = makeResponse();

    await createExportHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(200);
    expect(dependencies.jobStore.createExportJob).toHaveBeenCalledTimes(1);
    expect(dependencies.jobStore.createExportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        sessionId,
        sourceBlobKey,
        sourceRevision: 4,
        settings: {
          format: "mp3",
          bitrate: "192k",
          extension: "mp3",
          contentType: "audio/mpeg",
          policyVersion: 1,
        },
      }),
    );
    expect(dependencies.queue.dispatch).toHaveBeenCalledTimes(1);
    expect(dependencies.queue.dispatch).toHaveBeenCalledWith("job_456");
    expect(response.body).toMatchObject({
      jobId: "job_456",
      status: "queued",
      stage: "queued",
      progressPercent: 0,
    });
  });
});
