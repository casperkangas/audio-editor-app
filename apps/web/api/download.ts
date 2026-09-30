import { Readable } from "node:stream";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { get } from "@vercel/blob";
import { createRedisJobStore, type JobStore } from "./_lib/jobs.js";

interface DownloadBlob {
  contentType: string;
  stream: ReadableStream<Uint8Array>;
}

export interface DownloadRouteDependencies {
  jobStore: Pick<JobStore, "get">;
  getBlob: (key: string) => Promise<DownloadBlob | null>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stripUnsafeFilenameCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127 && !'<>:"/\\|?*'.includes(character);
    })
    .join("");
}

function sanitizeFilename(value: string, extension: string): string | null {
  const base = stripUnsafeFilenameCharacters(value)
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[. ]+$/g, "")
    .slice(0, 100);
  if (!base) return null;

  return `${base}${extension}`;
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\;]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function createDownloadHandler(dependencies: DownloadRouteDependencies) {
  return async function downloadHandler(
    request: VercelRequest,
    response: VercelResponse,
  ) {
    if (request.method !== "POST") {
      return response.status(405).json({ error: "Method not allowed" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const jobId = asString(body?.jobId);
    const sessionId = asString(body?.sessionId);
    const requestedName = asString(body?.filename);
    if (!jobId || !sessionId || !requestedName) {
      return response.status(400).json({ error: "Download details are incomplete." });
    }

    try {
      const job = await dependencies.jobStore.get(jobId);
      if (
        !job ||
        job.sessionId !== sessionId ||
        job.status !== "succeeded" ||
        !job.outputBlobKey
      ) {
        return response.status(404).json({ error: "The finished audio is unavailable." });
      }

      const extension = job.outputBlobKey.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
      const filename = sanitizeFilename(requestedName, extension);
      if (!filename) {
        return response.status(400).json({ error: "Enter a valid file name." });
      }

      const blob = await dependencies.getBlob(job.outputBlobKey);
      if (!blob) {
        return response.status(404).json({ error: "The finished audio is unavailable." });
      }

      response.setHeader("Content-Type", blob.contentType);
      response.setHeader("Content-Disposition", contentDisposition(filename));
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Cache-Control", "private, no-store");
      response.status(200);
      return Readable.fromWeb(blob.stream).pipe(response);
    } catch {
      return response.status(404).json({ error: "The finished audio is unavailable." });
    }
  };
}

let defaultHandler: ReturnType<typeof createDownloadHandler> | null = null;

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  defaultHandler ??= createDownloadHandler({
    jobStore: createRedisJobStore(),
    getBlob: async (key) => {
      const result = await get(key, { access: "private" });
      if (!result?.stream) return null;
      return {
        contentType: result.blob.contentType ?? "application/octet-stream",
        stream: result.stream,
      };
    },
  });
  return defaultHandler(request, response);
}