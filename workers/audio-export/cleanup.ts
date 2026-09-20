import { deletePrivateBlob } from "../../apps/web/api/_lib/blob.js";
import type { TemporaryAudioWorkspace } from "./ffmpeg.js";

/**
 * Idempotently cleans up a temporary audio workspace.
 * Swallows errors to preserve the overall job state if cleanup fails.
 */
export async function cleanupWorkspace(
  workspace: TemporaryAudioWorkspace | null | undefined,
): Promise<void> {
  if (!workspace) return;
  try {
    await workspace.cleanup();
  } catch (error) {
    console.error("Failed to cleanup temporary workspace:", error);
  }
}

/**
 * Idempotently deletes a failed or orphaned output blob.
 * Swallows errors to preserve the overall job state if cleanup fails.
 */
export async function cleanupFailedOutput(
  outputBlobKey: string | null | undefined,
  token?: string,
): Promise<void> {
  if (!outputBlobKey || outputBlobKey.trim().length === 0) return;

  try {
    await deletePrivateBlob(outputBlobKey, token);
  } catch (error) {
    console.error("Failed to cleanup output blob:", error);
  }
}
