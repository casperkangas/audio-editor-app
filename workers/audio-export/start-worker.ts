import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - Resolved at runtime via NODE_PATH pointing to apps/web/node_modules
import { createClient } from "redis";
import { createRedisJobStore } from "../../apps/web/api/_lib/jobs.js";
import { createExportWorker } from "./worker.js";

// 1. Load environment variables from apps/web/.env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../apps/web/.env.local");

try {
  // Available in Node.js 20.6.0+
  process.loadEnvFile(envPath);
} catch (err) {
  console.warn(
    `Could not load env file at ${envPath}. Assuming environment variables are already set.`,
  );
}

// Start a dummy HTTP server so Render.com's "Web Service" free tier health checks pass
import http from "node:http";
const port = process.env.PORT || 10000;
http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Worker is running!");
  })
  .listen(port, () => {
    console.log(`Health check HTTP server listening on port ${port}`);
  });

const QUEUE_KEY = "audio:export-queue";

async function startWorker() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error("REDIS_URL is not defined in environment variables.");
    process.exit(1);
  }

  console.log("Initializing worker...");

  // 2. Connect to Redis using process.env.REDIS_URL and instantiate the RedisJobStore
  const jobStore = createRedisJobStore(redisUrl);
  const processJob = createExportWorker(jobStore);

  // We need a dedicated Redis connection for blocking operations like blPop
  const queueClient = createClient({ url: redisUrl });
  queueClient.on("error", (err: unknown) =>
    console.error("Redis Queue Client Error:", err),
  );

  await queueClient.connect();

  console.log(`Worker started. Listening for jobs on "${QUEUE_KEY}"...`);

  // 3. Enter a continuous while loop
  while (true) {
    try {
      // Use blPop with a 0 timeout to block indefinitely until a message arrives
      // Node Redis v4 blPop returns { key: string, element: string } | null
      const result = await queueClient.blPop(QUEUE_KEY, 0);

      if (!result) continue;

      const { element } = result;

      // 4. Parse the string into JSON and pass it to processJob
      let messageObj: unknown;
      try {
        messageObj = JSON.parse(element);
      } catch (e) {
        console.error("Failed to parse queue message as JSON:", element);
        continue;
      }

      await processJob(messageObj);
    } catch (error) {
      // 5. Handle any top-level errors gracefully so the loop doesn't crash
      console.error("Top-level worker loop error:", error);

      // Add a small delay on error to prevent tight crash loops
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}

startWorker().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});
