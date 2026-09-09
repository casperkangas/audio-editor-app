import { handleUpload } from "@vercel/blob/client";

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await request.json();

  const jsonResponse = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      const filename = pathname.split("/").pop() ?? "";

      if (!filename || !/\.(wav|mp3|flac|ogg|aac|m4a)$/i.test(filename)) {
        throw new Error("Unsupported audio file type");
      }

      return {
        allowedContentTypes: [
          "audio/wav",
          "audio/mpeg",
          "audio/flac",
          "audio/ogg",
          "audio/aac",
          "audio/mp4",
          "audio/x-m4a",
        ],
        maximumSizeInBytes: 50 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({
          purpose: "audio-upload",
        }),
      };
    },
    onUploadCompleted: async ({ blob }) => {
      console.log("Audio upload completed:", blob.pathname);
    },
  });

  return Response.json(jsonResponse);
}
