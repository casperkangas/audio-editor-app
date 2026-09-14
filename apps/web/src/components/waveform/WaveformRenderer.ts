/**
 * components/waveform/WaveformRenderer.ts
 *
 * Pure Canvas 2D drawing utilities for the waveform display.
 * No React here – the React component wraps this and drives it via a ref.
 *
 * Coordinate system:
 *   x = 0..canvasWidth  maps to  t = 0..duration (seconds)
 *   y = 0..canvasHeight maps to  amplitude –1..+1 (mirrored, centred)
 */

export interface WaveformRenderOptions {
  /** Peak amplitudes, one value per horizontal pixel */
  peaks: Float32Array;
  /** Total duration of the audio in seconds */
  duration: number;
  /** Current playhead position in seconds */
  playhead: number;
  /** Optional selection region in seconds */
  selection?: { startTime: number; endTime: number } | null;
  /** Canvas colours */
  colors?: Partial<WaveformColors>;
}

export interface WaveformColors {
  background: string;
  waveform:   string;
  playhead:   string;
  selection:  string;  // fill colour (semi-transparent recommended)
  selectionBorder: string;
}

const DEFAULT_COLORS: WaveformColors = {
  background:    '#1a1a2e',
  waveform:      '#4ecca3',
  playhead:      '#e94560',
  selection:     'rgba(233, 69, 96, 0.2)',
  selectionBorder: 'rgba(233, 69, 96, 0.7)',
};

export function renderWaveform(
  canvas: HTMLCanvasElement,
  opts: WaveformRenderOptions,
): void {
  const ctx    = canvas.getContext('2d');
  if (!ctx) return;

  const { peaks, duration, playhead, selection } = opts;
  const colors = { ...DEFAULT_COLORS, ...opts.colors };
  const W      = canvas.width;
  const H      = canvas.height;
  const mid    = H / 2;

  // ─── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, W, H);

  if (peaks.length === 0 || duration <= 0) return;

  // ─── Selection highlight ─────────────────────────────────────────────────
  if (selection) {
    const sx = timeToX(selection.startTime, duration, W);
    const ex = timeToX(selection.endTime,   duration, W);
    ctx.fillStyle = colors.selection;
    ctx.fillRect(sx, 0, ex - sx, H);
    // Left border
    ctx.fillStyle = colors.selectionBorder;
    ctx.fillRect(sx, 0, 1, H);
    // Right border
    ctx.fillRect(ex - 1, 0, 1, H);
  }

  // ─── Waveform bars ───────────────────────────────────────────────────────
  ctx.fillStyle = colors.waveform;

  // Map peaks array (which may differ in length from W) onto canvas pixels
  for (let px = 0; px < W; px++) {
    const peakIdx = Math.floor((px / W) * peaks.length);
    const amp     = peaks[peakIdx] ?? 0; // 0..1
    const barH    = Math.max(1, amp * mid);
    ctx.fillRect(px, mid - barH, 1, barH * 2);
  }

  // ─── Centre line ─────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, mid - 0.5, W, 1);

  // ─── Playhead ────────────────────────────────────────────────────────────
  if (duration > 0) {
    const px = timeToX(playhead, duration, W);
    ctx.fillStyle = colors.playhead;
    ctx.fillRect(px - 1, 0, 2, H);

    // Small triangle at top
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 10);
    ctx.closePath();
    ctx.fill();
  }
}

/** Convert a time in seconds to a canvas x-coordinate */
export function timeToX(time: number, duration: number, canvasWidth: number): number {
  if (duration <= 0) return 0;
  return Math.round((time / duration) * canvasWidth);
}

/** Convert a canvas x-coordinate to a time in seconds */
export function xToTime(x: number, duration: number, canvasWidth: number): number {
  if (canvasWidth <= 0) return 0;
  return Math.max(0, Math.min(duration, (x / canvasWidth) * duration));
}
