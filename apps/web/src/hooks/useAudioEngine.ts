/**
 * hooks/useAudioEngine.ts
 *
 * React hook that bridges the AudioEngine singleton to React state.
 * Returns transport controls and reactive playback state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { audioEngine, type PlaybackState } from '../lib/audio/engine';
import { validateAudioFile, validateAudioDuration } from '../lib/validation/fileValidation';

export interface UseAudioEngineResult {
  /** Current playhead in seconds */
  currentTime:  number;
  /** Total duration of loaded audio in seconds */
  duration:     number;
  playbackState: PlaybackState;
  /** True while the file is being decoded */
  loading:      boolean;
  /** Non-empty string if the last load/validation failed */
  error:        string | null;
  /** Load a File object from an <input> or drag-drop */
  loadFile:     (file: File) => Promise<void>;
  /** Load an already-decoded AudioBuffer (after an edit operation) */
  loadBuffer:   (buf: AudioBuffer) => void;
  play:         () => void;
  pause:        () => void;
  stop:         () => void;
  seek:         (t: number) => void;
}

export function useAudioEngine(): UseAudioEngineResult {
  const [currentTime,   setCurrentTime]   = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // Keep a stable ref to duration so callbacks don't go stale
  const durationRef = useRef(0);

  useEffect(() => {
    const unsubPlayhead = audioEngine.onPlayhead(t => setCurrentTime(t));
    const unsubState    = audioEngine.onStateChange(s => setPlaybackState(s));
    return () => {
      unsubPlayhead();
      unsubState();
    };
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);

    // Client-side validation first
    const fileResult = validateAudioFile(file);
    if (!fileResult.valid) {
      setError(fileResult.errors[0]);
      setLoading(false);
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer      = await audioEngine.loadArrayBuffer(arrayBuffer);

      // Post-decode duration validation
      const durResult = validateAudioDuration(buffer);
      if (!durResult.valid) {
        setError(durResult.errors[0]);
        setLoading(false);
        return;
      }

      durationRef.current = buffer.duration;
      setDuration(buffer.duration);
      setCurrentTime(0);
    } catch (err) {
      setError('Could not decode audio. The file may be corrupt or unsupported.');
      console.error('[useAudioEngine] loadFile error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBuffer = useCallback((buf: AudioBuffer) => {
    audioEngine.loadBuffer(buf);
    durationRef.current = buf.duration;
    setDuration(buf.duration);
    setCurrentTime(0);
    setError(null);
  }, []);

  const play  = useCallback(() => audioEngine.play(),  []);
  const pause = useCallback(() => audioEngine.pause(), []);
  const stop  = useCallback(() => audioEngine.stop(),  []);
  const seek  = useCallback((t: number) => audioEngine.seek(t), []);

  return { currentTime, duration, playbackState, loading, error, loadFile, loadBuffer, play, pause, stop, seek };
}
