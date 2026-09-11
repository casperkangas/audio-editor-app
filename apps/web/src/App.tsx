/**
 * App.tsx
 *
 * Root component for the Web Audio Editor.
 * Wires together the three hooks (useAudioEngine, useEditHistory, useWaveform)
 * and all UI components into a single cohesive editor.
 *
 * Architecture at a glance:
 *   - useAudioEngine   → Web Audio API playback (play/pause/stop/seek)
 *   - useEditHistory   → Non-destructive operations + undo/redo + working buffer
 *   - useWaveform      → Selection region state
 *
 * When an edit is applied the working buffer is updated in useEditHistory and
 * immediately swapped into the audio engine so the next play always reflects
 * the latest edits.
 */

import { useEffect, useCallback } from "react";
import { Analytics } from "@vercel/analytics/react";

import { useAudioEngine } from "./hooks/useAudioEngine";
import { useEditHistory } from "./hooks/useEditHistory";
import { useWaveform } from "./hooks/useWaveform";
import { audioEngine } from "./lib/audio/engine";

import TransportControls from "./components/transport/TransportControls";
import EditToolbar from "./components/toolbar/EditToolbar";
import WaveformPanel from "./components/waveform/WaveformPanel";
import ExportPanel from "./components/export/ExportPanel";

import type { ExportFormat } from "./types";

import "./App.css";

export default function App() {
  // ─── Engine / history / selection ──────────────────────────────────────
  const engine = useAudioEngine();
  const editor = useEditHistory();
  const wave = useWaveform();

  // When the working buffer is updated (after any edit or undo/redo),
  // push it into the engine so playback stays in sync.
  useEffect(() => {
    if (editor.workingBuffer) {
      engine.loadBuffer(editor.workingBuffer);
    }
  }, [editor.workingBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a new file is loaded, seed the edit history with the raw buffer.
  const handleFileLoad = useCallback(
    async (file: File) => {
      wave.clearSelection();
      await engine.loadFile(file);
      // After loadFile resolves the engine holds the decoded buffer; we also
      // need it in the editor.  Access it via the engine's public buffer prop.
      // We rely on useEffect below to pick it up via audioEngine directly.
    },
    [engine, wave],
  );

  // Seed editor once the audio engine finishes decoding a new file.
  // We watch `engine.duration` as the signal that a new buffer is ready.
  useEffect(() => {
    if (engine.duration > 0) {
      // Access the decoded buffer via the singleton directly (static import, no dynamic import needed)
      const buf = audioEngine["buffer"] as AudioBuffer | null;
      if (buf && buf.duration === engine.duration) {
        editor.reset(buf);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.duration]);

  // ─── Edit operation helpers ─────────────────────────────────────────────

  const sel = wave.selection;

  const handleTrim = useCallback(() => {
    if (!sel) return;
    editor.applyOperation("trim", {
      startTime: sel.startTime,
      endTime: sel.endTime,
    });
    wave.clearSelection();
  }, [sel, editor, wave]);

  const handleCut = useCallback(() => {
    if (!sel) return;
    editor.applyOperation("cut", {
      startTime: sel.startTime,
      endTime: sel.endTime,
    });
    wave.clearSelection();
  }, [sel, editor, wave]);

  const handleFadeIn = useCallback(() => {
    if (!sel) return;
    editor.applyOperation("fade-in", {
      startTime: sel.startTime,
      duration: sel.endTime - sel.startTime,
    });
  }, [sel, editor]);

  const handleFadeOut = useCallback(() => {
    if (!sel) return;
    editor.applyOperation("fade-out", {
      startTime: sel.startTime,
      duration: sel.endTime - sel.startTime,
    });
  }, [sel, editor]);

  const handleVolumeUp = useCallback(() => {
    if (!sel) return;
    editor.applyOperation("volume", {
      startTime: sel.startTime,
      endTime: sel.endTime,
      gain: 1.2,
    });
  }, [sel, editor]);

  const handleVolumeDown = useCallback(() => {
    if (!sel) return;
    editor.applyOperation("volume", {
      startTime: sel.startTime,
      endTime: sel.endTime,
      gain: 0.8,
    });
  }, [sel, editor]);

  // ─── Export (placeholder until server layer is implemented) ────────────

  const handleExport = useCallback((format: ExportFormat, bitrate: string) => {
    console.info("[Export] Requested format=%s bitrate=%s", format, bitrate);
    alert(
      `Export as ${format.toUpperCase()} (${bitrate}) – server integration coming soon.`,
    );
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  const editorDisabled = engine.loading || engine.duration === 0;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">
          <span className="app-title-icon" aria-hidden="true">
            🎚
          </span>
          Audio Editor
        </h1>
        {engine.loading && (
          <span className="app-status" role="status">
            Loading…
          </span>
        )}
      </header>

      <main className="app-main">
        {/* ── Toolbar ── */}
        <EditToolbar
          hasSelection={wave.hasSelection}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onTrim={handleTrim}
          onCut={handleCut}
          onFadeIn={handleFadeIn}
          onFadeOut={handleFadeOut}
          onVolumeUp={handleVolumeUp}
          onVolumeDown={handleVolumeDown}
          onUndo={editor.undoLast}
          onRedo={editor.redoLast}
          disabled={editorDisabled}
        />

        {/* ── Waveform ── */}
        <WaveformPanel
          peaks={editor.peaks}
          duration={engine.duration}
          playhead={engine.currentTime}
          selection={wave.selection}
          loading={engine.loading}
          error={engine.error}
          onFileLoad={handleFileLoad}
          onSeek={engine.seek}
          onSelectionChange={wave.setSelection}
        />

        {/* ── Transport ── */}
        <TransportControls
          state={engine.playbackState}
          currentTime={engine.currentTime}
          duration={engine.duration}
          onPlay={engine.play}
          onPause={engine.pause}
          onStop={engine.stop}
          disabled={editorDisabled}
        />

        {/* ── Export panel ── */}
        <ExportPanel
          duration={engine.duration}
          disabled={engine.loading}
          onExport={handleExport}
        />
      </main>
      <Analytics />
    </div>
  );
}
