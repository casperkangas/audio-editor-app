/**
 * components/transport/TransportControls.tsx
 *
 * Play / Pause / Stop controls and a time display.
 */

import type { PlaybackState } from '../../lib/audio/engine';

interface TransportControlsProps {
  state:       PlaybackState;
  currentTime: number;
  duration:    number;
  onPlay:      () => void;
  onPause:     () => void;
  onStop:      () => void;
  disabled?:   boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}

export default function TransportControls({
  state,
  currentTime,
  duration,
  onPlay,
  onPause,
  onStop,
  disabled = false,
}: TransportControlsProps) {
  const isPlaying = state === 'playing';

  return (
    <div className="transport-controls" role="toolbar" aria-label="Playback controls">
      <button
        type="button"
        onClick={onStop}
        disabled={disabled || state === 'idle'}
        aria-label="Stop"
        title="Stop"
        className="transport-btn"
      >
        ⏹
      </button>

      <button
        type="button"
        onClick={isPlaying ? onPause : onPlay}
        disabled={disabled || duration === 0}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={isPlaying ? 'Pause' : 'Play'}
        className="transport-btn transport-btn--primary"
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <span className="transport-time" aria-live="polite" aria-atomic="true">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}
