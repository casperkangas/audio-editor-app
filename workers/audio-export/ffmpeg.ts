import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExportJobRecord } from "../../apps/web/api/_lib/jobs.js";
import { MAX_AUDIO_DURATION_SECONDS } from "../../apps/web/api/_lib/export.validation.js";
import {
  createPrivateDownloadUrl,
  lookupPrivateBlob,
  type BlobAccessContext,
} from "../../apps/web/api/_lib/blob.js";

const TEMP_DIRECTORY_PREFIX = "audio-export-";
const SOURCE_FILE_NAME = "source.audio";
const FFPROBE_TIMEOUT_MS = 30_000;
const FFPROBE_MAX_OUTPUT_BYTES = 1024 * 1024;
const SUPPORTED_INPUT_CODECS = new Set([
  "aac",
  "flac",
  "mp3",
  "opus",
  "pcm_alaw",
  "pcm_f32le",
  "pcm_s16be",
  "pcm_s16le",
  "pcm_s24be",
  "pcm_s24le",
  "pcm_s32be",
  "pcm_s32le",
  "vorbis",
]);

const execFileAsync = promisify(execFile);

interface FfprobeStream {
  readonly codec_type?: unknown;
  readonly codec_name?: unknown;
  readonly duration?: unknown;
}

interface FfprobeFormat {
  readonly duration?: unknown;
  readonly format_name?: unknown;
}

interface FfprobeOutput {
  readonly streams?: unknown;
  readonly format?: unknown;
}

export interface AudioProbeResult {
  readonly codec: string;
  readonly durationSeconds: number;
  readonly formatName: string | null;
}

export type ProbeCommand = (
  executable: string,
  args: readonly string[],
  options: { readonly timeout: number; readonly maxBuffer: number },
) => Promise<{ readonly stdout: string }>;

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

export class AudioProbeError extends Error {
  readonly errorCode:
    | "SOURCE_INVALID"
    | "UNSUPPORTED_CODEC"
    | "PROCESSING_FAILED";

  constructor(errorCode: AudioProbeError["errorCode"], message: string) {
    super(message);
    this.name = "AudioProbeError";
    this.errorCode = errorCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFiniteDuration(value: unknown): number | null {
  const duration = typeof value === "string" ? Number(value) : value;
  return typeof duration === "number" && Number.isFinite(duration)
    ? duration
    : null;
}

function parseProbeOutput(stdout: string): AudioProbeResult {
  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new AudioProbeError(
      "SOURCE_INVALID",
      "The source audio metadata is invalid.",
    );
  }

  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const audioStream = streams.find(
    (stream): stream is FfprobeStream =>
      isRecord(stream) && stream.codec_type === "audio",
  );
  if (!audioStream) {
    throw new AudioProbeError(
      "SOURCE_INVALID",
      "The source does not contain an audio stream.",
    );
  }

  if (typeof audioStream.codec_name !== "string") {
    throw new AudioProbeError(
      "UNSUPPORTED_CODEC",
      "The source audio codec is unsupported.",
    );
  }
  if (!SUPPORTED_INPUT_CODECS.has(audioStream.codec_name)) {
    throw new AudioProbeError(
      "UNSUPPORTED_CODEC",
      "The source audio codec is unsupported.",
    );
  }

  const format = isRecord(parsed.format)
    ? (parsed.format as FfprobeFormat)
    : {};
  const durationSeconds =
    parseFiniteDuration(audioStream.duration) ??
    parseFiniteDuration(format.duration);
  if (
    durationSeconds === null ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_AUDIO_DURATION_SECONDS
  ) {
    throw new AudioProbeError(
      "SOURCE_INVALID",
      "The source audio duration is invalid or unsupported.",
    );
  }

  return {
    codec: audioStream.codec_name,
    durationSeconds,
    formatName:
      typeof format.format_name === "string" ? format.format_name : null,
  };
}

async function runFfprobe(
  executable: string,
  args: readonly string[],
  options: { readonly timeout: number; readonly maxBuffer: number },
): Promise<{ readonly stdout: string }> {
  return execFileAsync(executable, [...args], options) as Promise<{
    readonly stdout: string;
  }>;
}

export async function probeAudioFile(
  sourcePath: string,
  runProbe: ProbeCommand = runFfprobe,
): Promise<AudioProbeResult> {
  if (sourcePath.trim().length === 0) {
    throw new AudioProbeError("SOURCE_INVALID", "The source path is invalid.");
  }

  try {
    const result = await runProbe(
      "ffprobe",
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        sourcePath,
      ],
      { timeout: FFPROBE_TIMEOUT_MS, maxBuffer: FFPROBE_MAX_OUTPUT_BYTES },
    );
    return parseProbeOutput(result.stdout);
  } catch (error) {
    if (error instanceof AudioProbeError) throw error;
    throw new AudioProbeError(
      "PROCESSING_FAILED",
      "The source audio could not be inspected.",
    );
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
