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
    settings: { format: "mp3", bitrate: "192k" },
    status: "succeeded",
    stage: "succeeded",
    progressPercent: 100,
    revision: 2,
    leaseExpiresAt: null,
    retentionDeadline: new Date("2026-09-21T00:00:00.000Z"),
    outputBlobKey: "audio/export/project_123/job_456.mp3",
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

describe("GET /api/jobs/[jobId] conversion metadata", () => {
  it("returns signed URLs and conversion metadata for a successful output", async () => {
    const dependencies = makeDependencies(makeJob());
    const response = makeResponse();

    await createJobStatusHandler(dependencies)(makeRequest(), response as never);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      jobId: "job_456",
      status: "succeeded",
      stage: "succeeded",
      progressPercent: 100,
      downloadUrl: "short-lived-signed-url",
      errorCode: null,
      error: null,
    });
    expect(dependencies.createDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_123",
        sessionId,
        reference: expect.objectContaining({
          key: "audio/export/project_123/job_456.mp3",
          kind: "export",
        }),
      }),
    );
  });

  it("exposes a safe conversion failure without leaking internals", async () => {
    const dependencies = makeDependencies(
      makeJob({
        status: "failed",
        stage: "failed",
        errorCode: "UNSUPPORTED_CODEC",
        errorMessage: "ffmpeg raw error details",
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
