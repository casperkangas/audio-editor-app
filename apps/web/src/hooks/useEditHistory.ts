/**
 * hooks/useEditHistory.ts
 *
 * React hook that manages the non-destructive edit history.
 * Keeps the current AudioBuffer in sync with the applied operations.
 */

import { useState, useCallback, useRef } from 'react';
import { createHistory, pushOperation, undo, redo, canUndo, canRedo } from '../lib/editing/history';
import {
  applyTrim,
  applyFadeIn,
  applyFadeOut,
  applyVolume,
  applyCut,
  applySplit,
  extractPeaks,
} from '../lib/editing/operations';
import type {
  EditHistory,
  EditOperation,
  EditOperationType,
  EditOperationParams,
  TrimParams,
  CutParams,
  SplitParams,
  VolumeParams,
  FadeInParams,
  FadeOutParams,
  SelectionRegion,
} from '../types';

export interface UseEditHistoryResult {
  history:       EditHistory;
  /** The AudioBuffer reflecting all current operations */
  workingBuffer: AudioBuffer | null;
  /** Downsampled peaks for the working buffer */
  peaks:         Float32Array | null;
  canUndo:       boolean;
  canRedo:       boolean;
  applyOperation: (type: EditOperationType, params: EditOperationParams) => void;
  undoLast:      () => void;
  redoLast:      () => void;
  reset:         (sourceBuffer: AudioBuffer) => void;
  /** Convenience: split at a point, returns the two buffers (does not replace workingBuffer) */
  splitAt:       (time: number) => [AudioBuffer, AudioBuffer] | null;
}

const PEAKS_RESOLUTION = 800; // one peak value per canvas-pixel at 800 px wide

function generateId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function applyToBuffer(
  buffer: AudioBuffer,
  type: EditOperationType,
  params: EditOperationParams,
): AudioBuffer {
  switch (type) {
    case 'trim':     return applyTrim(buffer,    params as TrimParams);
    case 'cut':      return applyCut(buffer,     params as CutParams);
    case 'volume':   return applyVolume(buffer,  params as VolumeParams);
    case 'fade-in':  return applyFadeIn(buffer,  params as FadeInParams);
    case 'fade-out': return applyFadeOut(buffer, params as FadeOutParams);
    case 'split':
      // Split is non-destructive: we return the left side as the "main" buffer.
      return applySplit(buffer, params as SplitParams)[0];
    default:
      return buffer;
  }
}

export function useEditHistory(): UseEditHistoryResult {
  const sourceBufferRef = useRef<AudioBuffer | null>(null);
  const [history, setHistory] = useState<EditHistory>(createHistory());
  const [workingBuffer, setWorkingBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  /** Recompute the working buffer by replaying all present operations from source */
  const recompute = useCallback(
    (h: EditHistory, source: AudioBuffer | null) => {
      if (!source) return;
      let buf: AudioBuffer = source;
      for (const op of h.present) {
        buf = applyToBuffer(buf, op.type, op.params);
      }
      setWorkingBuffer(buf);
      setPeaks(extractPeaks(buf, PEAKS_RESOLUTION));
    },
    [],
  );

  const applyOperation = useCallback(
    (type: EditOperationType, params: EditOperationParams) => {
      const op: EditOperation = {
        id:        generateId(),
        type,
        params,
        createdAt: Date.now(),
      };
      setHistory(prev => {
        const next = pushOperation(prev, op);
        recompute(next, sourceBufferRef.current);
        return next;
      });
    },
    [recompute],
  );

  const undoLast = useCallback(() => {
    setHistory(prev => {
      if (!canUndo(prev)) return prev;
      const next = undo(prev);
      recompute(next, sourceBufferRef.current);
      return next;
    });
  }, [recompute]);

  const redoLast = useCallback(() => {
    setHistory(prev => {
      if (!canRedo(prev)) return prev;
      const next = redo(prev);
      recompute(next, sourceBufferRef.current);
      return next;
    });
  }, [recompute]);

  const reset = useCallback(
    (sourceBuffer: AudioBuffer) => {
      sourceBufferRef.current = sourceBuffer;
      const h = createHistory();
      setHistory(h);
      setWorkingBuffer(sourceBuffer);
      setPeaks(extractPeaks(sourceBuffer, PEAKS_RESOLUTION));
    },
    [],
  );

  const splitAt = useCallback(
    (time: number): [AudioBuffer, AudioBuffer] | null => {
      if (!workingBuffer) return null;
      return applySplit(workingBuffer, { at: time });
    },
    [workingBuffer],
  );

  return {
    history,
    workingBuffer,
    peaks,
    canUndo:        canUndo(history),
    canRedo:        canRedo(history),
    applyOperation,
    undoLast,
    redoLast,
    reset,
    splitAt,
  };
}

// Keep SelectionRegion import clean (used by callers that derive params from it)
export type { SelectionRegion };
