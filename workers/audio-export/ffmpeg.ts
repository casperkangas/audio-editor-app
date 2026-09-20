import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExportJobRecord } from "../../apps/web/api/_lib/jobs.js";
import {
  EXPORT_FORMAT_POLICIES,
  LOSSY_BITRATES,
  LOSSY_QUALITY_PRESETS,
  MAX_AUDIO_DURATION_SECONDS,
  validateExportSettings,
  type ValidatedExportSettings,
} from "../../apps/web/api/_lib/export.validation.js";
import {
  createPrivateDownloadUrl,
  lookupPrivateBlob,
  uploadPrivateBlob,
  type BlobAccessContext,
} from "../../apps/web/api/_lib/blob.js";
import type { RenderEffect, RenderPlan } from "./render-plan.js";

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

function assertFiniteFilterValue(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new WorkerSourceError(`The render plan contains an invalid ${name}.`);
  }
}

function formatFilterValue(value: number, name: string): string {
  assertFiniteFilterValue(value, name);
  return String(value);
}

function renderEffect(effect: RenderEffect, segmentStartTime: number): string {
  if (effect.type === "volume") {
    const startTime = effect.startTime - segmentStartTime;
    const endTime = effect.endTime - segmentStartTime;
    assertFiniteFilterValue(effect.gain, "gain");
    return `volume=volume=${formatFilterValue(effect.gain, "gain")}:enable='between(t,${formatFilterValue(startTime, "effect start")},${formatFilterValue(endTime, "effect end")})'`;
  }

  const startTime = effect.startTime - segmentStartTime;
  assertFiniteFilterValue(startTime, "fade start");
  assertFiniteFilterValue(effect.duration, "fade duration");
  return `afade=t=${effect.type === "fade-in" ? "in" : "out"}:st=${formatFilterValue(startTime, "fade start")}:d=${formatFilterValue(effect.duration, "fade duration")}`;
}

function renderSegmentFilter(
  segment: RenderPlan["segments"][number],
  index: number,
): string {
  const startTime = formatFilterValue(segment.startTime, "segment start");
  const endTime = formatFilterValue(segment.endTime, "segment end");
  const filters = [
    `atrim=start=${startTime}:end=${endTime}`,
    "asetpts=PTS-STARTPTS",
    ...segment.effects.map((effect) => renderEffect(effect, segment.startTime)),
  ];
  return `[0:a]${filters.join(",")}[segment${index}]`;
}

function buildFilterComplex(plan: RenderPlan): string {
  if (plan.segments.length === 0) {
    throw new WorkerSourceError("The render plan contains no audio segments.");
  }

  const segmentFilters = plan.segments.map((segment, index) =>
    renderSegmentFilter(segment, index),
  );
  const labels = plan.segments.map((_, index) => `[segment${index}]`).join("");
  return `${segmentFilters.join(";")};${labels}concat=n=${plan.segments.length}:v=0:a=1[outa]`;
}

class EncoderPolicyError extends WorkerSourceError {
  constructor(message: string) {
    super(message);
    this.name = "EncoderPolicyError";
  }
}

function buildQualityArgs(settings: ValidatedExportSettings): string[] {
  if (settings.bitrate !== undefined && settings.qualityPreset !== undefined) {
    throw new EncoderPolicyError(
      "Bitrate and quality preset cannot be selected together.",
    );
  }

  if (settings.bitrate !== undefined) {
    if (!(LOSSY_BITRATES as readonly string[]).includes(settings.bitrate)) {
      throw new EncoderPolicyError("The selected bitrate is not supported.");
    }
    return ["-b:a", settings.bitrate];
  }

  if (settings.qualityPreset === undefined) return [];

  if (settings.format === "wav" || settings.format === "flac") {
    if (settings.qualityPreset !== "lossless") {
      throw new EncoderPolicyError(
        "This format only supports lossless quality.",
      );
    }
    return [];
  }

  if (
    !(LOSSY_QUALITY_PRESETS as readonly string[]).includes(
      settings.qualityPreset,
    )
  ) {
    throw new EncoderPolicyError(
      "The selected quality preset is not supported.",
    );
  }

  const qualityValue =
    settings.format === "mp3"
      ? { low: "7", medium: "4", high: "2" }
      : settings.format === "ogg"
        ? { low: "3", medium: "5", high: "8" }
        : { low: "4", medium: "2", high: "1" };
  const qualityPreset = settings.qualityPreset as "low" | "medium" | "high";
  return ["-q:a", qualityValue[qualityPreset]];
}

function buildEncoderArgs(settings: ValidatedExportSettings): string[] {
  const policy = EXPORT_FORMAT_POLICIES[settings.format];
  switch (settings.format) {
    case "wav":
      return ["-c:a", policy.codec, "-f", policy.muxer];
    case "mp3":
      return [
        "-c:a",
        policy.codec,
        ...buildQualityArgs(settings),
        "-f",
        policy.muxer,
      ];
    case "flac":
      return ["-c:a", policy.codec, "-f", policy.muxer];
    case "ogg":
      return [
        "-c:a",
        policy.codec,
        ...buildQualityArgs(settings),
        "-f",
        policy.muxer,
      ];
    case "aac":
      return [
        "-c:a",
        policy.codec,
        ...buildQualityArgs(settings),
        "-f",
        policy.muxer,
      ];
  }
}

export function buildFfmpegArgs(
  sourcePath: string,
  outputPath: string,
  plan: RenderPlan,
  settings: ValidatedExportSettings,
): readonly string[] {
  if (
    sourcePath.length === 0 ||
    outputPath.length === 0 ||
    sourcePath.includes("\0") ||
    outputPath.includes("\0")
  ) {
    throw new WorkerSourceError("The FFmpeg input or output path is invalid.");
  }

  const filterComplex = buildFilterComplex(plan);
  return [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i",
    sourcePath,
    "-filter_complex",
    filterComplex,
    "-map",
    "[outa]",
    ...buildEncoderArgs(settings),
    outputPath,
  ];
}

function outputPathForJob(job: ExportJobRecord, extension: string): string {
  if (
    !/^[A-Za-z0-9_-]+$/.test(job.jobId) ||
    !/^[A-Za-z0-9_-]+$/.test(job.projectId)
  ) {
    throw new WorkerSourceError("The export identity is invalid.");
  }
  return `audio/export/${job.projectId}/${job.jobId}.${extension}`;
}

export async function verifyOutputFile(
  outputPath: string,
  settings: ValidatedExportSettings,
  runProbe: ProbeCommand = runFfprobe,
): Promise<AudioProbeResult> {
  const probe = await probeAudioFile(outputPath, runProbe);
  const policy = EXPORT_FORMAT_POLICIES[settings.format];
  const expectedOutputCodec = {
    wav: "pcm_s16le",
    mp3: "mp3",
    flac: "flac",
    ogg: "vorbis",
    aac: "aac",
  }[settings.format];
  if (probe.codec !== expectedOutputCodec) {
    throw new AudioProbeError(
      "UNSUPPORTED_CODEC",
      "The generated output codec does not match the requested format.",
    );
  }
  if (
    probe.formatName === null ||
    !probe.formatName.split(",").includes(policy.muxer)
  ) {
    throw new AudioProbeError(
      "SOURCE_INVALID",
      "The generated output container does not match the requested format.",
    );
  }
  return probe;
}

export type CompleteOutput = (
  job: ExportJobRecord,
  outputBlobKey: string,
) => Promise<ExportJobRecord>;

export async function finalizeRenderedOutput(
  job: ExportJobRecord,
  outputPath: string,
  completeOutput: CompleteOutput,
  token?: string,
  runProbe: ProbeCommand = runFfprobe,
): Promise<ExportJobRecord> {
  const settingsResult = validateExportSettings(job.settings);
  if (!settingsResult.valid) {
    throw new WorkerSourceError(settingsResult.message);
  }

  const settings = settingsResult.value;
  const outputProbe = await verifyOutputFile(outputPath, settings, runProbe);
  if (outputProbe.durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
    throw new AudioProbeError(
      "SOURCE_INVALID",
      "The generated output duration is unsupported.",
    );
  }

  const outputKey = outputPathForJob(job, settings.extension);
  const outputBytes = await readFile(outputPath);
  await uploadPrivateBlob(outputKey, outputBytes, settings.contentType, token);
  return completeOutput(job, outputKey);
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
