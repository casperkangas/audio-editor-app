/**
 * Unit tests for lib/editing/operations.ts
 *
 * Tests use the MockAudioBuffer from setup.ts (injected as global AudioBuffer).
 */

import { describe, it, expect } from 'vitest';
import {
  sliceBuffer,
  concatBuffers,
  applyTrim,
  applyCut,
  applySplit,
  applyVolume,
  applyFadeIn,
  applyFadeOut,
  extractPeaks,
} from './operations';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeBuffer(samples: number[], sampleRate = 44100): AudioBuffer {
  const buf = new AudioBuffer({ numberOfChannels: 1, length: samples.length, sampleRate });
  const data = buf.getChannelData(0);
  data.set(samples);
  return buf;
}

function getChannel(buf: AudioBuffer, ch = 0): number[] {
  return Array.from(buf.getChannelData(ch));
}

// ─── sliceBuffer ──────────────────────────────────────────────────────────

describe('sliceBuffer', () => {
  it('extracts the correct sub-region', () => {
    const buf    = makeBuffer([1, 2, 3, 4, 5]);
    const sliced = sliceBuffer(buf, 1, 4);
    expect(getChannel(sliced)).toEqual([2, 3, 4]);
  });

  it('clamps start/end to buffer bounds', () => {
    const buf    = makeBuffer([1, 2, 3]);
    const sliced = sliceBuffer(buf, -10, 100);
    expect(getChannel(sliced)).toEqual([1, 2, 3]);
  });

  it('returns an empty buffer when start === end', () => {
    const buf    = makeBuffer([1, 2, 3]);
    const sliced = sliceBuffer(buf, 2, 2);
    expect(sliced.length).toBe(0);
  });
});

// ─── concatBuffers ────────────────────────────────────────────────────────

describe('concatBuffers', () => {
  it('joins two buffers in order', () => {
    const a   = makeBuffer([1, 2]);
    const b   = makeBuffer([3, 4, 5]);
    const out = concatBuffers(a, b);
    expect(getChannel(out)).toEqual([1, 2, 3, 4, 5]);
  });

  it('throws when sample rates differ', () => {
    const a = makeBuffer([1], 44100);
    const b = makeBuffer([2], 22050);
    expect(() => concatBuffers(a, b)).toThrow();
  });

  it('throws when channel counts differ', () => {
    const a = new AudioBuffer({ numberOfChannels: 1, length: 2, sampleRate: 44100 });
    const b = new AudioBuffer({ numberOfChannels: 2, length: 2, sampleRate: 44100 });
    expect(() => concatBuffers(a, b)).toThrow();
  });
});

// ─── applyTrim ────────────────────────────────────────────────────────────

describe('applyTrim', () => {
  it('keeps only the selected region', () => {
    const buf    = makeBuffer([10, 20, 30, 40, 50], 10);
    // 0.1s → sample 1,  0.4s → sample 4
    const result = applyTrim(buf, { startTime: 0.1, endTime: 0.4 });
    expect(getChannel(result)).toEqual([20, 30, 40]);
  });

  it('returns the full buffer when trim covers everything', () => {
    const buf    = makeBuffer([1, 2, 3], 1);
    const result = applyTrim(buf, { startTime: 0, endTime: 3 });
    expect(getChannel(result)).toEqual([1, 2, 3]);
  });
});

// ─── applyCut ─────────────────────────────────────────────────────────────

describe('applyCut', () => {
  it('removes the selected region', () => {
    const buf    = makeBuffer([1, 2, 3, 4, 5], 10);
    // 0.1s → sample 1,  0.4s → sample 4 (remove samples 1-3)
    const result = applyCut(buf, { startTime: 0.1, endTime: 0.4 });
    expect(getChannel(result)).toEqual([1, 5]);
  });

  it('returns only the after-segment when cut starts at 0', () => {
    const buf    = makeBuffer([1, 2, 3, 4], 10);
    const result = applyCut(buf, { startTime: 0, endTime: 0.2 });
    expect(getChannel(result)).toEqual([3, 4]);
  });

  it('returns only the before-segment when cut runs to the end', () => {
    const buf    = makeBuffer([1, 2, 3, 4], 10);
    const result = applyCut(buf, { startTime: 0.2, endTime: 0.4 });
    expect(getChannel(result)).toEqual([1, 2]);
  });

  it('does not mutate the source when the selected region is empty', () => {
    const buf = makeBuffer([1, 2, 3]);
    const result = applyCut(buf, { startTime: 0.2, endTime: 0.2 });
    expect(getChannel(result)).toEqual([1, 2, 3]);
    expect(getChannel(buf)).toEqual([1, 2, 3]);
  });
});

// ─── applySplit ───────────────────────────────────────────────────────────

describe('applySplit', () => {
  it('returns two non-overlapping halves', () => {
    const buf          = makeBuffer([1, 2, 3, 4, 5], 10);
    const [left, right] = applySplit(buf, { at: 0.3 }); // sample 3
    expect(getChannel(left)).toEqual([1, 2, 3]);
    expect(getChannel(right)).toEqual([4, 5]);
  });

  it('left + right sample counts equal original', () => {
    const buf          = makeBuffer([1, 2, 3, 4, 5, 6], 10);
    const [left, right] = applySplit(buf, { at: 0.2 });
    expect(left.length + right.length).toBe(6);
  });
});

// ─── applyVolume ──────────────────────────────────────────────────────────

describe('applyVolume', () => {
  it('scales samples in the specified region', () => {
    const buf    = makeBuffer([1, 1, 1, 1, 1], 10);
    const result = applyVolume(buf, { startTime: 0.1, endTime: 0.4, gain: 2 });
    // Sample 0: unchanged (before region), samples 1-3: doubled, sample 4: unchanged
    expect(getChannel(result)[0]).toBeCloseTo(1);
    expect(getChannel(result)[1]).toBeCloseTo(2);
    expect(getChannel(result)[2]).toBeCloseTo(2);
    expect(getChannel(result)[3]).toBeCloseTo(2);
    expect(getChannel(result)[4]).toBeCloseTo(1);
  });

  it('does not mutate the source buffer', () => {
    const buf  = makeBuffer([1, 1, 1], 10);
    applyVolume(buf, { startTime: 0, endTime: 0.3, gain: 0 });
    expect(getChannel(buf)).toEqual([1, 1, 1]);
  });

  it('clamps negative gain to 0', () => {
    const buf    = makeBuffer([1, 1, 1], 10);
    const result = applyVolume(buf, { startTime: 0, endTime: 0.3, gain: -5 });
    expect(getChannel(result)).toEqual([0, 0, 0]);
  });
});

// ─── applyFadeIn ──────────────────────────────────────────────────────────

describe('applyFadeIn', () => {
  it('first sample in region is near 0, last is near original', () => {
    // 10 samples at sampleRate=10  → 1 second total
    const samples = Array.from({ length: 10 }, () => 1.0);
    const buf     = makeBuffer(samples, 10);
    const result  = applyFadeIn(buf, { startTime: 0, duration: 1 });
    const out     = getChannel(result);
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[9]).toBeCloseTo(0.9, 1); // (9/10) * 1.0
  });

  it('samples outside the fade region are unchanged', () => {
    const samples = Array.from({ length: 10 }, () => 1.0);
    const buf     = makeBuffer(samples, 10);
    // Fade only covers the first 0.5s (samples 0-4), sample 5+ untouched
    const result  = applyFadeIn(buf, { startTime: 0, duration: 0.5 });
    const out     = getChannel(result);
    expect(out[5]).toBeCloseTo(1.0);
    expect(out[9]).toBeCloseTo(1.0);
  });
});

// ─── applyFadeOut ─────────────────────────────────────────────────────────

describe('applyFadeOut', () => {
  it('first sample in region is near original, last is near 0', () => {
    const samples = Array.from({ length: 10 }, () => 1.0);
    const buf     = makeBuffer(samples, 10);
    const result  = applyFadeOut(buf, { startTime: 0, duration: 1 });
    const out     = getChannel(result);
    expect(out[0]).toBeCloseTo(1.0, 1);
    expect(out[9]).toBeCloseTo(0.1, 1); // (1 - 9/10) * 1.0
  });

  it('does not affect samples before the fade region', () => {
    const samples = Array.from({ length: 10 }, () => 1.0);
    const buf     = makeBuffer(samples, 10);
    const result  = applyFadeOut(buf, { startTime: 0.5, duration: 0.5 });
    const out     = getChannel(result);
    // Samples 0-4 are before the fade – should be untouched
    for (let i = 0; i < 5; i++) {
      expect(out[i]).toBeCloseTo(1.0);
    }
  });
});

// ─── extractPeaks ─────────────────────────────────────────────────────────

describe('extractPeaks', () => {
  it('returns the correct number of buckets', () => {
    const buf   = makeBuffer(Array.from({ length: 1000 }, () => 0.5));
    const peaks = extractPeaks(buf, 50);
    expect(peaks.length).toBe(50);
  });

  it('each bucket value is between 0 and 1', () => {
    const samples = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.3));
    const buf     = makeBuffer(samples);
    const peaks   = extractPeaks(buf, 10);
    for (const p of peaks) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('peak equals max absolute value in the bucket', () => {
    // Buffer: [0.1, 0.5, 0.2] – 1 bucket → peak should be 0.5
    const buf   = makeBuffer([0.1, 0.5, 0.2]);
    const peaks = extractPeaks(buf, 1);
    expect(peaks[0]).toBeCloseTo(0.5);
  });
});
