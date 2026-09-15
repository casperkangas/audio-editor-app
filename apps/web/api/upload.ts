import { handleUpload } from "@vercel/blob/client";
import {
  ALLOWED_AUDIO_CONTENT_TYPES,
  getMaxUploadSizeBytes,
  isAllowedAudioContentType,
  isAllowedAudioFilename,
} from "./upload.validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

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
      onBeforeGenerateToken: async (pathname) => {
        if (!isAllowedAudioFilename(pathname)) {
          throw new Error("Unsupported audio file type");
        }

        return {
          allowedContentTypes: [...ALLOWED_AUDIO_CONTENT_TYPES],
          maximumSizeInBytes: getMaxUploadSizeBytes(),
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            purpose: "audio-upload",
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
    const isClientError = /unsupported|invalid|size|content type|payload/i.test(
      message,
    );

    return response.status(isClientError ? 400 : 500).json({
      error: isClientError ? message : "Upload request failed",
    });
  }
}
