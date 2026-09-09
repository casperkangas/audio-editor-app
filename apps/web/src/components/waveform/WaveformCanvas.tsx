/**
 * components/waveform/WaveformCanvas.tsx
 *
 * React component that owns the <canvas> element and calls the pure renderer
 * on every relevant prop change.  Also handles mouse interaction for selection.
 */

import { useRef, useEffect, useCallback, type MouseEvent } from 'react';
import { renderWaveform, xToTime } from './WaveformRenderer';
import type { SelectionRegion } from '../../types';

interface WaveformCanvasProps {
  peaks:         Float32Array | null;
  duration:      number;
  playhead:      number;
  selection:     SelectionRegion | null;
  onSeek?:       (time: number) => void;
  onSelectionChange?: (region: SelectionRegion | null) => void;
  height?:       number;
}

export default function WaveformCanvas({
  peaks,
  duration,
  playhead,
  selection,
  onSeek,
  onSelectionChange,
  height = 120,
}: WaveformCanvasProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const dragging    = useRef(false);
  const dragStart   = useRef(0);

  // Re-render whenever display data changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderWaveform(canvas, {
      peaks:     peaks ?? new Float32Array(0),
      duration,
      playhead,
      selection,
    });
  }, [peaks, duration, playhead, selection]);

  // Keep canvas pixel width in sync with its layout width
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (canvas.width !== Math.round(w)) {
          canvas.width = Math.round(w);
          // Re-render immediately
          renderWaveform(canvas, {
            peaks:     peaks ?? new Float32Array(0),
            duration,
            playhead,
            selection,
          });
        }
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, duration, playhead, selection]);

  // ─── Mouse interaction ──────────────────────────────────────────────────

  const getTime = useCallback(
    (e: MouseEvent<HTMLCanvasElement>): number => {
      const canvas = canvasRef.current!;
      const rect   = canvas.getBoundingClientRect();
      const x      = e.clientX - rect.left;
      return xToTime(x, duration, canvas.width);
    },
    [duration],
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      const t = getTime(e);
      dragging.current  = true;
      dragStart.current = t;
      // Single click: clear selection and seek
      onSelectionChange?.(null);
      onSeek?.(t);
    },
    [getTime, onSeek, onSelectionChange],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      if (!dragging.current) return;
      const t = getTime(e);
      const [start, end] = dragStart.current < t
        ? [dragStart.current, t]
        : [t, dragStart.current];
      if (end - start > 0.01) {
        onSelectionChange?.({ startTime: start, endTime: end });
      }
    },
    [getTime, onSelectionChange],
  );

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={height}
      style={{ width: '100%', height: `${height}px`, cursor: 'crosshair', display: 'block' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      role="img"
      aria-label="Audio waveform"
    />
  );
}
