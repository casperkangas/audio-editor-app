// ─── Edit Operations ──────────────────────────────────────────────────────

export type EditOperationType =
  | 'trim'
  | 'cut'
  | 'split'
  | 'volume'
  | 'fade-in'
  | 'fade-out';

export interface TrimParams   { startTime: number; endTime: number }
export interface CutParams    { startTime: number; endTime: number }
export interface SplitParams  { at: number }
export interface VolumeParams { startTime: number; endTime: number; gain: number }
export interface FadeInParams  { startTime: number; duration: number }
export interface FadeOutParams { startTime: number; duration: number }

export type EditOperationParams =
  | TrimParams | CutParams | SplitParams
  | VolumeParams | FadeInParams | FadeOutParams;

export interface EditOperation {
  id: string;
  type: EditOperationType;
  params: EditOperationParams;
  createdAt: number;
}

// ─── Selection ────────────────────────────────────────────────────────────

export interface SelectionRegion {
  startTime: number;
  endTime: number;
}

// ─── History ──────────────────────────────────────────────────────────────

export interface EditHistory {
  past:    EditOperation[][];
  present: EditOperation[];
  future:  EditOperation[][];
}

// ─── Playback ─────────────────────────────────────────────────────────────

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped';
