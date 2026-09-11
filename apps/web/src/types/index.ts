// ─── Edit Operation Types ──────────────────────────────────────────────────

export type EditOperationType =
  | 'trim'
  | 'cut'
  | 'split'
  | 'volume'
  | 'fade-in'
  | 'fade-out';

export interface TrimParams {
  startTime: number; // seconds – keep from here
  endTime: number;   // seconds – keep until here
}

export interface CutParams {
  startTime: number; // seconds – remove from here
  endTime: number;   // seconds – remove until here
}

export interface SplitParams {
  at: number; // seconds – split point
}

export interface VolumeParams {
  startTime: number;
  endTime: number;
  gain: number; // 0.0 – 2.0  (1.0 = original)
}

export interface FadeInParams {
  startTime: number;
  duration: number; // seconds over which gain ramps 0 → 1
}

export interface FadeOutParams {
  startTime: number;
  duration: number; // seconds over which gain ramps 1 → 0
}

export type EditOperationParams =
  | TrimParams
  | CutParams
  | SplitParams
  | VolumeParams
  | FadeInParams
  | FadeOutParams;

export interface EditOperation {
  id: string;
  type: EditOperationType;
  params: EditOperationParams;
  /** Wall-clock time the operation was applied */
  createdAt: number;
}

// ─── Waveform / Region ────────────────────────────────────────────────────

export interface WaveformPeaks {
  /** Downsampled peak amplitudes in [-1, 1] for each pixel column */
  data: Float32Array;
  /** Sample rate of the original decoded buffer */
  sampleRate: number;
  /** Total duration in seconds of the decoded audio */
  duration: number;
}

export interface SelectionRegion {
  startTime: number;
  endTime: number;
}

// ─── Audio Project ────────────────────────────────────────────────────────

export type ProjectStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'exporting'
  | 'failed';

export interface AudioProject {
  id: string;
  sourceFileName: string;
  sourceFormat: string;
  durationSeconds: number;
  status: ProjectStatus;
  /** The decoded PCM buffer from the browser – not serialisable, lives in memory only */
  audioBuffer: AudioBuffer | null;
  /** Ordered list of operations that have been applied */
  operations: EditOperation[];
  selection: SelectionRegion | null;
  playheadSeconds: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Edit History (undo/redo) ──────────────────────────────────────────────

export interface EditHistory {
  past: EditOperation[][];
  present: EditOperation[];
  future: EditOperation[][];
}

// ─── Export / Processing ──────────────────────────────────────────────────

export type ExportFormat = 'wav' | 'mp3' | 'flac' | 'ogg' | 'aac';
export type ExportStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ExportSettings {
  format: ExportFormat;
  bitrate?: string; // e.g. '192k' – only relevant for lossy formats
}

export interface ExportJob {
  id: string;
  projectId: string;
  status: ExportStatus;
  settings: ExportSettings;
  progressPercent: number;
  downloadUrl: string | null;
  errorMessage: string | null;
  requestedAt: number;
  completedAt: number | null;
}

// ─── Validation ───────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const SUPPORTED_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/flac',
  'audio/x-flac',
  'audio/ogg',
  'audio/aac',
  'audio/mp4',
] as const;

export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
export const MAX_DURATION_SECONDS = 60 * 60;           // 1 hour
