/**
 * lib/useEditor.ts
 *
 * Single hook that owns all editor state:
 *   - Audio decoding and playback (Web Audio API)
 *   - Non-destructive edit operations
 *   - Undo / redo
 *   - Waveform peaks for display
 *   - Selection region
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { audioEngine } from './audio/engine';
import type { PlaybackState } from './audio/engine';
import {
  applyTrim, applyCut, applySplit,
  applyVolume, applyFadeIn, applyFadeOut,
  extractPeaks,
} from './editing/operations';
import {
  createHistory, pushOperation, undo, redo,
  canUndo as _canUndo, canRedo as _canRedo,
} from './editing/history';
import { validateAudioFile } from './validation/validateAudioFile';
import type {
  EditHistory, EditOperation, EditOperationType,
  EditOperationParams, TrimParams, CutParams, SplitParams,
  VolumeParams, FadeInParams, FadeOutParams, SelectionRegion,
} from './types';

const PEAKS_BUCKETS = 800;

function genId() { return `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

function replayOps(source: AudioBuffer, ops: EditOperation[]): AudioBuffer {
  let buf = source;
  for (const op of ops) {
    switch (op.type) {
      case 'trim':     buf = applyTrim(buf,    op.params as TrimParams);    break;
      case 'cut':      buf = applyCut(buf,     op.params as CutParams);     break;
      case 'split':    buf = applySplit(buf,   op.params as SplitParams)[0]; break;
      case 'volume':   buf = applyVolume(buf,  op.params as VolumeParams);  break;
      case 'fade-in':  buf = applyFadeIn(buf,  op.params as FadeInParams);  break;
      case 'fade-out': buf = applyFadeOut(buf, op.params as FadeOutParams); break;
    }
  }
  return buf;
}

export interface EditorState {
  // File
  fileName:      string;
  // Playback
  playbackState: PlaybackState;
  currentTime:   number;
  duration:      number;
  // Waveform
  peaks:         Float32Array | null;
  // Selection
  selection:     SelectionRegion | null;
  // History
  canUndo:       boolean;
  canRedo:       boolean;
  // Status
  loading:       boolean;
  error:         string | null;
  notice:        string | null;
}

export interface EditorActions {
  loadFile:      (file: File) => Promise<void>;
  clearFile:     () => void;
  play:          () => void;
  pause:         () => void;
  stop:          () => void;
  seek:          (t: number) => void;
  setSelection:  (r: SelectionRegion | null) => void;
  applyTrim:     () => void;
  applyDelete:   () => void;
  applySplit:    () => void;
  applyFadeIn:   () => void;
  applyFadeOut:  () => void;
  applyVolumeUp:   () => void;
  applyVolumeDown: () => void;
  undoLast:      () => void;
  redoLast:      () => void;
  dismissError:  () => void;
}

export function useEditor(): EditorState & EditorActions {
  const sourceRef  = useRef<AudioBuffer | null>(null);
  const historyRef = useRef<EditHistory>(createHistory());

  const [fileName,      setFileName]      = useState('');
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [currentTime,   setCurrentTime]   = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [peaks,         setPeaks]         = useState<Float32Array | null>(null);
  const [selection,     setSelectionState] = useState<SelectionRegion | null>(null);
  const [canUndoState,  setCanUndo]       = useState(false);
  const [canRedoState,  setCanRedo]       = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [notice,        setNotice]        = useState<string | null>(null);

  // Subscribe to engine events once
  useEffect(() => {
    const u1 = audioEngine.onPlayhead(t  => setCurrentTime(t));
    const u2 = audioEngine.onStateChange(s => setPlaybackState(s));
    return () => { u1(); u2(); };
  }, []);

  // ── History helpers ──────────────────────────────────────────────────────

  const syncHistory = useCallback((h: EditHistory) => {
    historyRef.current = h;
    setCanUndo(_canUndo(h));
    setCanRedo(_canRedo(h));
    if (!sourceRef.current) return;
    const working = replayOps(sourceRef.current, h.present);
    audioEngine.loadBuffer(working);
    setDuration(working.duration);
    setPeaks(extractPeaks(working, PEAKS_BUCKETS));
  }, []);

  const pushOp = useCallback((type: EditOperationType, params: EditOperationParams) => {
    const op: EditOperation = { id: genId(), type, params, createdAt: Date.now() };
    syncHistory(pushOperation(historyRef.current, op));
  }, [syncHistory]);

  // ── File loading ─────────────────────────────────────────────────────────

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    setNotice(null);
    const result = validateAudioFile(file);
    if (!result.valid) { setError(result.reason); return; }
    setLoading(true);
    try {
      const ab  = await file.arrayBuffer();
      const buf = await audioEngine.loadArrayBuffer(ab);
      sourceRef.current  = buf;
      historyRef.current = createHistory();
      setFileName(file.name);
      setDuration(buf.duration);
      setPeaks(extractPeaks(buf, PEAKS_BUCKETS));
      setCanUndo(false);
      setCanRedo(false);
      setSelectionState(null);
      setCurrentTime(0);
      setNotice('Audio loaded. Select a region of the waveform to start editing.');
    } catch {
      setError('Could not decode the audio file. It may be corrupt or use an unsupported codec.');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearFile = useCallback(() => {
    audioEngine.stop();
    audioEngine.dispose();
    sourceRef.current  = null;
    historyRef.current = createHistory();
    setFileName('');
    setDuration(0);
    setPeaks(null);
    setSelectionState(null);
    setCurrentTime(0);
    setCanUndo(false);
    setCanRedo(false);
    setError(null);
    setNotice(null);
  }, []);

  // ── Transport ────────────────────────────────────────────────────────────

  const play  = useCallback(() => audioEngine.play(),  []);
  const pause = useCallback(() => audioEngine.pause(), []);
  const stop  = useCallback(() => audioEngine.stop(),  []);
  const seek  = useCallback((t: number) => audioEngine.seek(t), []);

  // ── Selection ────────────────────────────────────────────────────────────

  const setSelection = useCallback((r: SelectionRegion | null) => setSelectionState(r), []);

  // ── Edit actions (all require a selection) ────────────────────────────────

  const requireSel = (sel: SelectionRegion | null): sel is SelectionRegion => {
    if (!sel) { setNotice('Select a region of the waveform first.'); return false; }
    return true;
  };

  const applyTrimAction = useCallback(() => {
    if (!requireSel(selection)) return;
    pushOp('trim', { startTime: selection.startTime, endTime: selection.endTime } as TrimParams);
    setSelectionState(null);
    setNotice('Trimmed to selected region. Undo to revert.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, pushOp]);

  const applyDeleteAction = useCallback(() => {
    if (!requireSel(selection)) return;
    pushOp('cut', { startTime: selection.startTime, endTime: selection.endTime } as CutParams);
    setSelectionState(null);
    setNotice('Deleted selected region. Undo to revert.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, pushOp]);

  const applySplitAction = useCallback(() => {
    if (!requireSel(selection)) return;
    // Split at the midpoint of the selection
    const at = (selection.startTime + selection.endTime) / 2;
    pushOp('split', { at } as SplitParams);
    setSelectionState(null);
    setNotice(`Split at ${at.toFixed(2)}s. The right segment was discarded. Undo to revert.`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, pushOp]);

  const applyFadeInAction = useCallback(() => {
    if (!requireSel(selection)) return;
    pushOp('fade-in', { startTime: selection.startTime, duration: selection.endTime - selection.startTime } as FadeInParams);
    setNotice('Fade in applied. Undo to revert.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, pushOp]);

  const applyFadeOutAction = useCallback(() => {
    if (!requireSel(selection)) return;
    pushOp('fade-out', { startTime: selection.startTime, duration: selection.endTime - selection.startTime } as FadeOutParams);
    setNotice('Fade out applied. Undo to revert.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, pushOp]);

  const applyVolumeUpAction = useCallback(() => {
    if (!requireSel(selection)) return;
    pushOp('volume', { startTime: selection.startTime, endTime: selection.endTime, gain: 1.2 } as VolumeParams);
    setNotice('Volume increased +20%. Undo to revert.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, pushOp]);

  const applyVolumeDownAction = useCallback(() => {
    if (!requireSel(selection)) return;
    pushOp('volume', { startTime: selection.startTime, endTime: selection.endTime, gain: 0.8 } as VolumeParams);
    setNotice('Volume decreased −20%. Undo to revert.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, pushOp]);

  // ── Undo / Redo ──────────────────────────────────────────────────────────

  const undoLast = useCallback(() => {
    syncHistory(undo(historyRef.current));
    setNotice('Undone.');
  }, [syncHistory]);

  const redoLast = useCallback(() => {
    syncHistory(redo(historyRef.current));
    setNotice('Redone.');
  }, [syncHistory]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoLast(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redoLast(); }
      if (e.key === ' ') { e.preventDefault(); playbackState === 'playing' ? pause() : play(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undoLast, redoLast, play, pause, playbackState]);

  return {
    fileName, playbackState, currentTime, duration,
    peaks, selection, canUndo: canUndoState, canRedo: canRedoState,
    loading, error, notice,
    loadFile, clearFile, play, pause, stop, seek,
    setSelection,
    applyTrim: applyTrimAction, applyDelete: applyDeleteAction,
    applySplit: applySplitAction, applyFadeIn: applyFadeInAction,
    applyFadeOut: applyFadeOutAction, applyVolumeUp: applyVolumeUpAction,
    applyVolumeDown: applyVolumeDownAction,
    undoLast, redoLast,
    dismissError: () => setError(null),
  };
}
