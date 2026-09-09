import { handleUpload } from "@vercel/blob/client";
import {
  ALLOWED_AUDIO_CONTENT_TYPES,
  getMaxUploadSizeBytes,
  isAllowedAudioContentType,
  isAllowedAudioFilename,
} from "./upload.validation";

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();

    const jsonResponse = await handleUpload({
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

    return Response.json(jsonResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload request failed";
    const isClientError = /unsupported|invalid|size|content type|payload/i.test(
      message,
    );

    return Response.json(
      { error: isClientError ? message : "Upload request failed" },
      { status: isClientError ? 400 : 500 },
    );
  }
}
