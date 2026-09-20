import { useRef, useCallback, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { useEditor } from "./lib/useEditor";
import type { SelectionRegion } from "./lib/types";
import "./App.css";

// ── Helpers ───────────────────────────────────────────────────────────────

function peaksToHeights(peaks: Float32Array | null, count: number): number[] {
  if (!peaks || peaks.length === 0) return Array(count).fill(20);
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i / count) * peaks.length);
    result.push(Math.max(4, Math.round((peaks[idx] ?? 0) * 100)));
  }
  return result;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const BAR_COUNT = 90;

// ── App ───────────────────────────────────────────────────────────────────

function App() {
  const editor = useEditor();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const dragStart = useRef<number | null>(null);

  const handleFile = (file?: File) => {
    if (!file) return;
    void editor.loadFile(file);
  };

  // ── Waveform interaction ──────────────────────────────────────────────

  const getTimeFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): number => {
      const rect = e.currentTarget.getBoundingClientRect();
      const frac = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      return frac * editor.duration;
    },
    [editor.duration],
  );

  const handleWaveformMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const t = getTimeFromEvent(e);
      dragStart.current = t;
      editor.setSelection(null);
      editor.seek(t);
    },
    [getTimeFromEvent, editor],
  );

  const handleWaveformMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragStart.current === null) return;
      if (!(e.buttons & 1)) {
        dragStart.current = null;
        return;
      }
      const t = getTimeFromEvent(e);
      const [s, end] =
        dragStart.current < t ? [dragStart.current, t] : [t, dragStart.current];
      if (end - s > 0.05) {
        editor.setSelection({ startTime: s, endTime: end } as SelectionRegion);
      }
    },
    [getTimeFromEvent, editor],
  );

  const handleWaveformMouseUp = useCallback(() => {
    dragStart.current = null;
  }, []);

  // ── Derived values ────────────────────────────────────────────────────

  const bars = peaksToHeights(editor.peaks, BAR_COUNT);
  const positionPct =
    editor.duration > 0 ? (editor.currentTime / editor.duration) * 100 : 0;
  const selStartPct =
    editor.selection && editor.duration > 0
      ? (editor.selection.startTime / editor.duration) * 100
      : 0;
  const selWidthPct =
    editor.selection && editor.duration > 0
      ? ((editor.selection.endTime - editor.selection.startTime) /
          editor.duration) *
        100
      : 0;
  const selDuration = editor.selection
    ? editor.selection.endTime - editor.selection.startTime
    : 0;
  const isPlaying = editor.playbackState === "playing";
  const hasFile = editor.fileName !== "";

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <main className="app-shell">
      {/* Top bar */}
      <header className="topbar">
        <a className="brand" href="/" aria-label="Sonicraft home">
          <span className="brand-mark">Ôîü</span>
          <span>Sonicraft</span>
        </a>
        <div className="topbar-actions">
          <span className="save-state">
            <span className="status-dot" />
            {hasFile ? "Session active" : "Saved locally"}
          </span>
          <button className="icon-button" aria-label="Help">
            ?
          </button>
          <button className="avatar" aria-label="Account">
            AC
          </button>
        </div>
      </header>

      <section className="workspace">
        {/* Hero */}
        <div className="intro-row">
          <div>
            <p className="eyebrow">A quiet place for loud ideas</p>
            <h1>Shape your sound.</h1>
            <p className="lede">
              Trim, polish, and convert audio right in your browser.
            </p>
          </div>
          <div className="privacy-note">
            <span className="lock">Ôîæ</span>
            <span>
              <strong>Private by default</strong>
              <br />
              Your audio stays in this session.
            </span>
          </div>
        </div>

        {/* Error banner */}
        {editor.error && (
          <div
            className="notice visible"
            role="alert"
            style={{ marginBottom: "16px", color: "#c0392b" }}
          >
            <span>ÔÜá</span>
            {editor.error}
            <button
              className="text-button"
              style={{ marginLeft: "12px" }}
              onClick={editor.dismissError}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Upload card */}
        {!hasFile && !editor.loading && (
          <div
            className="upload-card"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files[0]);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                fileInput.current?.click();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="upload-glyph">↑</div>
            <h2>Drop an audio file here</h2>
            <p>or choose a file from your device</p>
            <button
              className="primary-button"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInput.current?.click();
              }}
            >
              Choose audio file <span>→</span>
            </button>
            <p className="file-hint">
              MP3, WAV, FLAC, OGG, M4A <span>·</span> up to 200 MB
            </p>
          </div>
        )}

        {/* Loading */}
        {editor.loading && (
          <div className="upload-card" style={{ minHeight: 180, gap: "14px" }}>
            <div className="upload-glyph">Ôå╗</div>
            <p>Decoding audioÔÇª</p>
          </div>
        )}

        {/* Editor card */}
        {hasFile && !editor.loading && (
          <div className="editor-card">
            {/* File bar */}
            <div className="file-bar">
              <div className="file-title">
                <span className="audio-icon">Ôùû</span>
                <div>
                  <strong>{editor.fileName}</strong>
                  <span>{formatTime(editor.duration)} · decoded</span>
                </div>
              </div>
              <button className="text-button" onClick={editor.clearFile}>
                Replace file
              </button>
            </div>

            {/* Waveform */}
            <div className="waveform-wrap">
              <div className="timeline">
                <span>00:00</span>
                <span>{formatTime(editor.duration * 0.25)}</span>
                <span>{formatTime(editor.duration * 0.5)}</span>
                <span>{formatTime(editor.duration)}</span>
              </div>
              <div
                className="waveform"
                aria-label="Audio waveform ÔÇô drag to select a region, click to seek"
                role="img"
                onMouseDown={handleWaveformMouseDown}
                onMouseMove={handleWaveformMouseMove}
                onMouseUp={handleWaveformMouseUp}
                onMouseLeave={handleWaveformMouseUp}
              >
                {editor.selection && (
                  <div
                    className="selection"
                    style={{
                      left: `${selStartPct}%`,
                      width: `${selWidthPct}%`,
                    }}
                    aria-hidden="true"
                  />
                )}
                <div
                  className="playhead"
                  style={{ left: `${positionPct}%` }}
                  aria-hidden="true"
                />
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className={
                      (i / BAR_COUNT) * 100 < positionPct ? "played" : ""
                    }
                    style={{ height: `${h}%` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
              {editor.selection && (
                <div
                  className="selection-label"
                  style={{ left: `${selStartPct}%` }}
                  aria-live="polite"
                >
                  Selected · {formatTime(selDuration)}
                </div>
              )}
            </div>

            {/* Transport */}
            <div className="transport">
              <button
                className="transport-button"
                onClick={isPlaying ? editor.pause : editor.play}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "Ôàí" : "ÔûÂ"}
              </button>
              <span className="timecode">
                {formatTime(editor.currentTime)}{" "}
                <span>/ {formatTime(editor.duration)}</span>
              </span>
              <div className="transport-actions">
                <button
                  className="tool-button"
                  onClick={editor.undoLast}
                  disabled={!editor.canUndo}
                  aria-label="Undo"
                >
                  <span>ÔåÂ</span> Undo
                </button>
                <button
                  className="tool-button"
                  onClick={editor.redoLast}
                  disabled={!editor.canRedo}
                  aria-label="Redo"
                >
                  <span>ÔåÀ</span> Redo
                </button>
                <span className="divider" />
                <span className="volume-control">
                  Vol
                  <button
                    className="tool-button"
                    onClick={editor.applyVolumeUp}
                    disabled={!editor.selection}
                    title="Increase volume of selection (+20%)"
                  >
                    Ôû▓
                  </button>
                  <button
                    className="tool-button"
                    onClick={editor.applyVolumeDown}
                    disabled={!editor.selection}
                    title="Decrease volume of selection (ÔêÆ20%)"
                  >
                    Ôû╝
                  </button>
                </span>
              </div>
            </div>

            {/* Edit toolbar */}
            <div className="tool-row">
              <div className="tool-group">
                <span className="tool-label">Edit selection</span>
                <button
                  className="edit-button"
                  onClick={editor.applyTrim}
                  disabled={!editor.selection}
                  title="Keep only the selected region"
                >
                  Trim
                </button>
                <button
                  className="edit-button"
                  onClick={editor.applyDelete}
                  disabled={!editor.selection}
                  title="Remove selected region"
                >
                  Delete
                </button>
                <button
                  className="edit-button"
                  onClick={editor.applySplit}
                  disabled={!editor.selection}
                  title="Split at midpoint of selection"
                >
                  Split
                </button>
              </div>
              <div className="tool-group">
                <span className="tool-label">Effects</span>
                <button
                  className="edit-button"
                  onClick={editor.applyFadeIn}
                  disabled={!editor.selection}
                >
                  Fade in
                </button>
                <button
                  className="edit-button"
                  onClick={editor.applyFadeOut}
                  disabled={!editor.selection}
                >
                  Fade out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom row */}
        <div className="bottom-row">
          <div
            className={`notice ${editor.notice ? "visible" : ""}`}
            aria-live="polite"
          >
            <span>Ô£ª</span>
            {editor.notice ?? " "}
          </div>
          <button
            className="export-button"
            onClick={() => setExportOpen(true)}
            disabled={!hasFile}
            aria-label="Export audio"
          >
            Export audio <span>Ôåù</span>
          </button>
        </div>

        {/* Export panel */}
        {exportOpen && (
          <div className="export-panel">
            <div>
              <p className="eyebrow">Final step</p>
              <h2>Export your audio</h2>
              <p className="panel-copy">
                Your edits will be rendered once, keeping the original file
                intact.
              </p>
            </div>
            <label>
              Format
              <select defaultValue="MP3">
                <option>MP3</option>
                <option>WAV</option>
                <option>FLAC</option>
                <option>OGG</option>
              </select>
            </label>
            <label>
              Quality
              <select defaultValue="High · 256 kbps">
                <option>High · 256 kbps</option>
                <option>Standard · 192 kbps</option>
                <option>Compact · 128 kbps</option>
              </select>
            </label>
            <div className="panel-actions">
              <button
                className="text-button"
                onClick={() => setExportOpen(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setExportOpen(false);
                  // TODO: wire to server export job when backend is ready
                  console.info("[export] queued");
                }}
              >
                Start export <span>→</span>
              </button>
            </div>
          </div>
        )}
      </section>

      <footer>
        <span>
          Sonicraft <span className="footer-dot">·</span> Browser audio editor
        </span>
        <span>
          No account required <span className="footer-dot">·</span> Your files
          stay private
        </span>
      </footer>

      <Analytics />
    </main>
  );
}

export default App;
