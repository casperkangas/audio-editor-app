import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  createDownloadHandler,
  type DownloadRouteDependencies,
} from "../../api/download.js";
import type { ExportJobRecord, JobStore } from "../../api/_lib/jobs.js";

const timestamp = new Date("2026-09-30T00:00:00.000Z");
const job: ExportJobRecord = {
  jobId: "job_456",
  projectId: "project_123",
  sessionId: "session_456",
  sourceBlobKey: "audio/source/project_123/source.wav",
  sourceRevision: 1,
  operations: [],
  settings: { format: "mp3" },
  status: "succeeded",
  stage: "succeeded",
  progressPercent: 100,
  revision: 2,
  leaseExpiresAt: null,
  retentionDeadline: new Date("2026-10-01T00:00:00.000Z"),
  outputBlobKey: "audio/export/project_123/job_456.mp3",
  errorCode: null,
  errorMessage: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function makeResponse() {
  const response = new PassThrough() as PassThrough & {
    statusCode: number;
    headers: Record<string, string>;
    status: (code: number) => typeof response;
    json: (value: unknown) => typeof response;
    setHeader: (name: string, value: string) => void;
  };
  response.statusCode = 200;
  response.headers = {};
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.json = (value) => {
    response.end(JSON.stringify(value));
    return response;
  };
  response.setHeader = (name, value) => {
    response.headers[name.toLowerCase()] = value;
  };
  return response;
}

function makeDependencies(
  overrides: Partial<DownloadRouteDependencies> = {},
): DownloadRouteDependencies {
  return {
    jobStore: { get: vi.fn(async () => job) } as unknown as JobStore,
    getBlob: vi.fn(async () => ({
      contentType: "audio/mpeg",
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("audio bytes"));
          controller.close();
        },
      }),
    })),
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>) {
  return { method: "POST", body } as never;
}

describe("POST /api/download", () => {
  it("streams the finished file with the chosen filename and output extension", async () => {
    const dependencies = makeDependencies();
    const response = makeResponse();
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));

    await createDownloadHandler(dependencies)(
      makeRequest({ jobId: job.jobId, sessionId: job.sessionId, filename: "My Mix" }),
      response as never,
    );
    await new Promise<void>((resolve) => response.on("finish", resolve));

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain('filename="My Mix.mp3"');
    expect(Buffer.concat(chunks).toString()).toBe("audio bytes");
  });

  it("does not stream another session's export", async () => {
    const dependencies = makeDependencies();
    const response = makeResponse();

    await createDownloadHandler(dependencies)(
      makeRequest({ jobId: job.jobId, sessionId: "other-session", filename: "mix" }),
      response as never,
    );

    expect(response.statusCode).toBe(404);
    expect(dependencies.getBlob).not.toHaveBeenCalled();
  });
});