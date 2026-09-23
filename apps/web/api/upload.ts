import { handleUpload } from "@vercel/blob/client";
import {
  ALLOWED_AUDIO_CONTENT_TYPES,
  getMaxUploadSizeBytes,
  isAllowedAudioContentType,
  isAllowedAudioFilename,
} from "./upload.validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createRedisJobStore } from "./_lib/jobs.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = request.body;

    const jsonResponse = await handleUpload({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!isAllowedAudioFilename(pathname)) {
          throw new Error("Unsupported audio file type");
        }

        let projectId = "";
        let sessionId = "";
        let sourceRevision = 1;
        if (clientPayload) {
          try {
            const parsed = JSON.parse(clientPayload);
            projectId = parsed.projectId || "";
            sessionId = parsed.sessionId || "";
            sourceRevision =
              typeof parsed.sourceRevision === "number"
                ? parsed.sourceRevision
                : 1;
          } catch (e) {
            console.error("Failed to parse client payload", e);
          }
        }

        if (!projectId || !sessionId) {
          throw new Error("Missing projectId or sessionId in client payload");
        }

        const jobStore = createRedisJobStore();
        await jobStore.createProjectSession({
          projectId,
          sessionId,
          sourceBlobKey: pathname,
          sourceRevision,
          durationSeconds: 7200, // Safe upper bound; the worker will probe the real duration using FFprobe
          updatedAt: new Date(),
        });

        return {
          allowedContentTypes: [...ALLOWED_AUDIO_CONTENT_TYPES],
          maximumSizeInBytes: getMaxUploadSizeBytes(),
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            purpose: "audio-upload",
            projectId,
            sessionId,
          }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        if (!isAllowedAudioContentType(blob.contentType)) {
          throw new Error("Unsupported audio content type");
        }

        console.info("Audio upload completed", {
          pathname: blob.pathname,
        });
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload request failed";
    const isClientError =
      /unsupported|invalid|size|content type|payload|missing/i.test(message);

    return response.status(isClientError ? 400 : 500).json({
      error: isClientError ? message : "Upload request failed",
    });
  }
}
