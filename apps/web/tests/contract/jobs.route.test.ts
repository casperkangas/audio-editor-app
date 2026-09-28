import { describe, expect, it, vi } from "vitest";
import {
  createJobStatusHandler,
  type JobStatusRouteDependencies,
} from "../../api/jobs/[jobId].js";
import type { ExportJobRecord, JobStore } from "../../api/_lib/jobs.js";

const sessionId = "session_456";

function makeJob(
  overrides: Partial<ExportJobRecord> = {},
): ExportJobRecord {
  const timestamp = new Date("2026-09-20T00:00:00.000Z");
  return {
    jobId: "job_456",
    projectId: "project_123",
    sessionId,
    sourceBlobKey: "audio/source/project_123/session_456/example.wav",
    sourceRevision: 4,
    operations: [],
    settings: { format: "wav" },
    status: "running",
    stage: "rendering",
    progressPercent: 42,
    revision: 2,
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

function makeDependencies(
  job: ExportJobRecord | null,
): JobStatusRouteDependencies {
  return {
    jobStore: {
      get: vi.fn(async () => job),
    } as unknown as JobStore,
    createDownloadUrl: vi.fn(async () => "short-lived-signed-url"),
  };
}

function makeRequest(jobId = "job_456") {
  return {
    method: "GET",
    headers: { "x-session-id": sessionId },
    query: { jobId },
  } as never;
}

describe("GET /api/jobs/[jobId]", () => {
  it("returns bounded progress for a running job", async () => {
    const dependencies = makeDependencies(makeJob());
    const response = makeResponse();

    await createJobStatusHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      jobId: "job_456",
      status: "running",
      stage: "rendering",
      progressPercent: 42,
      downloadUrl: null,
    });
  });

  it("signs a URL only for a successful terminal job", async () => {
    const dependencies = makeDependencies(
      makeJob({
        status: "succeeded",
        stage: "succeeded",
        progressPercent: 100,
        outputBlobKey: "audio/export/project_123/job_456.wav",
      }),
    );
    const response = makeResponse();

    await createJobStatusHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: "succeeded",
      downloadUrl: "short-lived-signed-url",
    });
    expect(dependencies.createDownloadUrl).toHaveBeenCalledOnce();
  });

  it("hides unknown and unauthorized jobs", async () => {
    const dependencies = makeDependencies(
      makeJob({ sessionId: "another-session" }),
    );
    const response = makeResponse();

    await createJobStatusHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: "Export job not found" });
  });

  it("maps terminal failures to safe user-facing errors", async () => {
    const dependencies = makeDependencies(
      makeJob({
        status: "failed",
        stage: "failed",
        progressPercent: 100,
        errorCode: "UNSUPPORTED_CODEC",
        errorMessage: "raw ffmpeg details",
      }),
    );
    const response = makeResponse();

    await createJobStatusHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: "failed",
      errorCode: "UNSUPPORTED_CODEC",
      error: "This audio cannot be exported with the selected format.",
    });
    expect(JSON.stringify(response.body)).not.toMatch(/ffmpeg/i);
  });
});