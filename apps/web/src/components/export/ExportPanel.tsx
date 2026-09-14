/**
 * components/export/ExportPanel.tsx
 *
 * Export panel – placeholder for the server-side render/conversion flow.
 * The format selector and "Export" button are wired up; the actual job
 * submission will be added when the server layer is implemented.
 */

import { useState } from 'react';
import type { ExportFormat } from '../../types';

interface ExportPanelProps {
  disabled?: boolean;
  duration:  number;
  onExport?: (format: ExportFormat, bitrate: string) => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; supportsBitrate: boolean }[] = [
  { value: 'wav',  label: 'WAV (lossless)',   supportsBitrate: false },
  { value: 'mp3',  label: 'MP3',              supportsBitrate: true  },
  { value: 'flac', label: 'FLAC (lossless)',  supportsBitrate: false },
  { value: 'ogg',  label: 'OGG Vorbis',       supportsBitrate: true  },
  { value: 'aac',  label: 'AAC',              supportsBitrate: true  },
];

const BITRATE_OPTIONS = ['96k', '128k', '192k', '256k', '320k'];

export default function ExportPanel({ disabled = false, duration, onExport }: ExportPanelProps) {
  const [format,  setFormat]  = useState<ExportFormat>('mp3');
  const [bitrate, setBitrate] = useState('192k');

  const selectedFmt = FORMAT_OPTIONS.find(f => f.value === format)!;
  const ready = duration > 0 && !disabled;

  const handleExport = () => {
    onExport?.(format, bitrate);
  };

  return (
    <div className="export-panel">
      <h3 className="export-title">Export</h3>

      <div className="export-field">
        <label htmlFor="export-format" className="export-label">Format</label>
        <select
          id="export-format"
          value={format}
          onChange={e => setFormat(e.target.value as ExportFormat)}
          disabled={!ready}
          className="export-select"
        >
          {FORMAT_OPTIONS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {selectedFmt.supportsBitrate && (
        <div className="export-field">
          <label htmlFor="export-bitrate" className="export-label">Bitrate</label>
          <select
            id="export-bitrate"
            value={bitrate}
            onChange={e => setBitrate(e.target.value)}
            disabled={!ready}
            className="export-select"
          >
            {BITRATE_OPTIONS.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={!ready}
        className="export-btn"
        aria-label={`Export as ${format.toUpperCase()}`}
      >
        Export as {format.toUpperCase()}
      </button>

      {!ready && duration === 0 && (
        <p className="export-hint">Load an audio file to enable export.</p>
      )}
    </div>
  );
}
