import { createClient } from "redis";

export interface ExportQueue {
  dispatch(jobId: string): Promise<void>;
}

const EXPORT_QUEUE_KEY = "audio:export-queue";

type RedisClient = ReturnType<typeof createClient>;

export class RedisExportQueue implements ExportQueue {
  constructor(private readonly client: RedisClient) {}

  async dispatch(jobId: string): Promise<void> {
    await this.client.rPush(EXPORT_QUEUE_KEY, JSON.stringify({ jobId }));
  }
}

export function createRedisExportQueue(
  url = process.env.REDIS_URL,
): RedisExportQueue {
  if (!url) throw new Error("REDIS_URL is required");

  const client = createClient({ url });
  client.on("error", (err) => console.warn("Redis Queue Error:", err));
  void client.connect();
  return new RedisExportQueue(client as RedisClient);
}
