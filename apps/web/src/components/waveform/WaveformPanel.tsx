/**
 * components/waveform/WaveformPanel.tsx
 *
 * Waveform area: drag-and-drop upload + canvas display + empty state.
 */

import { useRef, type DragEvent } from 'react';
import WaveformCanvas from './WaveformCanvas';
import type { SelectionRegion } from '../../types';

interface WaveformPanelProps {
  peaks:         Float32Array | null;
  duration:      number;
  playhead:      number;
  selection:     SelectionRegion | null;
  loading:       boolean;
  error:         string | null;
  onFileLoad:    (file: File) => void;
  onSeek:        (t: number) => void;
  onSelectionChange: (region: SelectionRegion | null) => void;
}

export default function WaveformPanel({
  peaks,
  duration,
  playhead,
  selection,
  loading,
  error,
  onFileLoad,
  onSeek,
  onSelectionChange,
}: WaveformPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFileLoad(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const hasAudio = duration > 0;

  return (
    <div
      className="waveform-panel"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* File upload area (visible when no audio loaded) */}
      {!hasAudio && !loading && (
        <div
          className="upload-drop-zone"
          role="button"
          tabIndex={0}
          aria-label="Upload audio file"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <div className="upload-icon" aria-hidden="true">🎵</div>
          <p className="upload-label">Drop an audio file here, or click to browse</p>
          <p className="upload-hint">Supports WAV · MP3 · FLAC · OGG · AAC</p>
          {error && <p className="upload-error" role="alert">{error}</p>}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="waveform-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>Loading audio…</span>
        </div>
      )}

      {/* Error state when audio was previously loaded */}
      {error && hasAudio && (
        <p className="waveform-error" role="alert">{error}</p>
      )}

      {/* Waveform canvas */}
      {hasAudio && (
        <WaveformCanvas
          peaks={peaks}
          duration={duration}
          playhead={playhead}
          selection={selection}
          onSeek={onSeek}
          onSelectionChange={onSelectionChange}
          height={140}
        />
      )}

      {/* Selection info bar */}
      {selection && (
        <div className="selection-info" aria-live="polite">
          Selection: {selection.startTime.toFixed(2)}s – {selection.endTime.toFixed(2)}s
          &nbsp;({(selection.endTime - selection.startTime).toFixed(2)}s)
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        aria-hidden="true"
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  );
}
