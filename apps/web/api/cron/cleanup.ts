import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createRedisJobStore } from "../_lib/jobs.js";
import { deletePrivateBlob } from "../_lib/blob.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // 1. Verify Authorization Header
  const authHeader = request.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  try {
    const jobStore = createRedisJobStore();
    const now = Date.now();
    let deletedSessions = 0;
    let deletedJobs = 0;
    let deletedBlobs = 0;

    // We can query the underlying Redis client directly to scan keys
    // @ts-expect-error accessing private client for administrative cron
    const client = jobStore.client;

    // 2. Cleanup ProjectSessions
    const sessionKeys = await client.keys("audio:project:*");
    for (const key of sessionKeys) {
      const data = await client.get(key);
      if (data) {
        const session = JSON.parse(data);
        const updatedAt = new Date(session.updatedAt).getTime();
        // If older than 24 hours
        if (now - updatedAt > 24 * 60 * 60 * 1000) {
          if (session.sourceBlobKey) {
            try {
              await deletePrivateBlob(session.sourceBlobKey);
              deletedBlobs++;
            } catch (e) {
              console.error(`Failed to delete blob ${session.sourceBlobKey}`, e);
            }
          }
          await client.del(key);
          deletedSessions++;
        }
      }
    }

    // 3. Cleanup ExportJobs
    const jobKeys = await client.keys("audio:job:*");
    for (const key of jobKeys) {
      const data = await client.get(key);
      if (data) {
        const job = JSON.parse(data);
        const deadline = new Date(job.retentionDeadline).getTime();
        // If retention deadline has passed
        if (now > deadline) {
          if (job.outputBlobKey) {
            try {
              await deletePrivateBlob(job.outputBlobKey);
              deletedBlobs++;
            } catch (e) {
              console.error(`Failed to delete blob ${job.outputBlobKey}`, e);
            }
          }
          await client.del(key);
          deletedJobs++;
        }
      }
    }

    return response.status(200).json({
      message: "Cleanup complete",
      deletedSessions,
      deletedJobs,
      deletedBlobs,
    });
  } catch (error) {
    console.error("Cleanup cron failed:", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
