import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExportJobRecord } from "../../apps/web/api/_lib/jobs.js";
import {
  createPrivateDownloadUrl,
  lookupPrivateBlob,
  type BlobAccessContext,
} from "../../apps/web/api/_lib/blob.js";

const TEMP_DIRECTORY_PREFIX = "audio-export-";
const SOURCE_FILE_NAME = "source.audio";

export interface TemporaryAudioWorkspace {
  readonly directoryPath: string;
  readonly sourcePath: string;
  readonly cleanup: () => Promise<void>;
}

export class WorkerSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerSourceError";
  }
}

function sourceBlobContext(job: ExportJobRecord): BlobAccessContext {
  return {
    projectId: job.projectId,
    sessionId: job.sessionId,
    reference: {
      projectId: job.projectId,
      sessionId: job.sessionId,
      key: job.sourceBlobKey,
      kind: "source",
    },
  };
}

async function createTemporaryDirectory(): Promise<string> {
  try {
    return await mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX));
  } catch {
    throw new WorkerSourceError("Unable to create temporary worker storage.");
  }
}

async function downloadSource(
  job: ExportJobRecord,
  sourcePath: string,
  token?: string,
): Promise<void> {
  const context = sourceBlobContext(job);

  try {
    await lookupPrivateBlob(context, token);
    const downloadUrl = await createPrivateDownloadUrl(context, token);
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error("Private Blob download failed.");
    }

    await writeFile(sourcePath, Buffer.from(await response.arrayBuffer()), {
      flag: "wx",
    });
  } catch {
    throw new WorkerSourceError("Unable to download the source audio.");
  }
}

export async function createSourceWorkspace(
  job: ExportJobRecord,
  token?: string,
): Promise<TemporaryAudioWorkspace> {
  const directoryPath = await createTemporaryDirectory();
  const sourcePath = join(directoryPath, SOURCE_FILE_NAME);

  try {
    await downloadSource(job, sourcePath, token);
  } catch (error) {
    await rm(directoryPath, { recursive: true, force: true });
    throw error;
  }

  let cleaned = false;
  return {
    directoryPath,
    sourcePath,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await rm(directoryPath, { recursive: true, force: true });
    },
  };
}

export async function readSourceBytes(
  workspace: TemporaryAudioWorkspace,
): Promise<Buffer> {
  return readFile(workspace.sourcePath);
}
