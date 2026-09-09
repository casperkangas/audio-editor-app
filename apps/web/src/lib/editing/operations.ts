/**
 * lib/editing/operations.ts
 *
 * Pure functions that operate on Web Audio API AudioBuffer objects.
 * Each function returns a *new* AudioBuffer; the original is never mutated.
 * This makes undo/redo trivial and keeps every edit non-destructive.
 */

import type {
  TrimParams,
  CutParams,
  SplitParams,
  VolumeParams,
  FadeInParams,
  FadeOutParams,
} from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Create an OfflineAudioContext large enough to hold `lengthSamples` frames.
 * Falls back gracefully if the context constructor isn't available (tests / SSR).
 */
function makeOfflineCtx(
  numberOfChannels: number,
  lengthSamples: number,
  sampleRate: number,
): OfflineAudioContext {
  return new OfflineAudioContext(numberOfChannels, lengthSamples, sampleRate);
}

/** Convert a time in seconds to the nearest sample index */
function timeToSample(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

/**
 * Allocate a new AudioBuffer and copy a slice [startSample, endSample) from src.
 * Works directly on the raw channel data without an OfflineAudioContext so it
 * is synchronous and usable in tests without a browser runtime.
 */
export function sliceBuffer(
  src: AudioBuffer,
  startSample: number,
  endSample: number,
): AudioBuffer {
  const clampedStart = Math.max(0, Math.min(startSample, src.length));
  const clampedEnd   = Math.max(clampedStart, Math.min(endSample, src.length));
  const length       = clampedEnd - clampedStart;

  // In a real browser AudioBuffer can be constructed directly.
  // In tests we use a minimal mock (see __mocks__/audioBuffer.ts).
  const out = new AudioBuffer({
    numberOfChannels: src.numberOfChannels,
    length,
    sampleRate: src.sampleRate,
  });

  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const srcData = src.getChannelData(ch);
    const outData = out.getChannelData(ch);
    outData.set(srcData.subarray(clampedStart, clampedEnd));
  }

  return out;
}

/**
 * Concatenate two AudioBuffers. Both must share the same sampleRate and
 * numberOfChannels.
 */
export function concatBuffers(a: AudioBuffer, b: AudioBuffer): AudioBuffer {
  if (a.sampleRate !== b.sampleRate) {
    throw new Error('Cannot concat buffers with different sample rates');
  }
  if (a.numberOfChannels !== b.numberOfChannels) {
    throw new Error('Cannot concat buffers with different channel counts');
  }

  const totalLength = a.length + b.length;
  const out = new AudioBuffer({
    numberOfChannels: a.numberOfChannels,
    length: totalLength,
    sampleRate: a.sampleRate,
  });

  for (let ch = 0; ch < a.numberOfChannels; ch++) {
    const outData = out.getChannelData(ch);
    outData.set(a.getChannelData(ch), 0);
    outData.set(b.getChannelData(ch), a.length);
  }

  return out;
}

// ─── Edit Operations ──────────────────────────────────────────────────────

/**
 * Trim: keep only the audio between startTime and endTime.
 */
export function applyTrim(buffer: AudioBuffer, params: TrimParams): AudioBuffer {
  const start = timeToSample(params.startTime, buffer.sampleRate);
  const end   = timeToSample(params.endTime,   buffer.sampleRate);
  return sliceBuffer(buffer, start, end);
}

/**
 * Cut: remove the audio between startTime and endTime, joining the flanks.
 */
export function applyCut(buffer: AudioBuffer, params: CutParams): AudioBuffer {
  const cutStart = timeToSample(params.startTime, buffer.sampleRate);
  const cutEnd   = timeToSample(params.endTime,   buffer.sampleRate);

  const before = sliceBuffer(buffer, 0, cutStart);
  const after  = sliceBuffer(buffer, cutEnd, buffer.length);

  // Edge cases: if one side is empty just return the other
  if (before.length === 0) return after;
  if (after.length  === 0) return before;

  return concatBuffers(before, after);
}

/**
 * Split: returns [left, right] — the two halves of the buffer at `at` seconds.
 * This is purely a split; the caller decides what to do with each segment.
 */
export function applySplit(
  buffer: AudioBuffer,
  params: SplitParams,
): [AudioBuffer, AudioBuffer] {
  const splitSample = timeToSample(params.at, buffer.sampleRate);
  const left  = sliceBuffer(buffer, 0, splitSample);
  const right = sliceBuffer(buffer, splitSample, buffer.length);
  return [left, right];
}

/**
 * Volume: apply a linear gain to all samples in [startTime, endTime].
 * Samples outside the range are unchanged.
 */
export function applyVolume(buffer: AudioBuffer, params: VolumeParams): AudioBuffer {
  const startSample = timeToSample(params.startTime, buffer.sampleRate);
  const endSample   = timeToSample(params.endTime,   buffer.sampleRate);
  const gain        = Math.max(0, params.gain); // no negative gain

  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src  = buffer.getChannelData(ch);
    const dest = out.getChannelData(ch);
    dest.set(src); // copy all samples first

    for (let i = startSample; i < endSample && i < buffer.length; i++) {
      dest[i] = src[i] * gain;
    }
  }

  return out;
}

/**
 * Fade-in: linearly ramp gain from 0 → 1 over `duration` seconds starting
 * at `startTime`.
 */
export function applyFadeIn(buffer: AudioBuffer, params: FadeInParams): AudioBuffer {
  const startSample = timeToSample(params.startTime, buffer.sampleRate);
  const fadeSamples = timeToSample(params.duration,  buffer.sampleRate);
  const endSample   = Math.min(startSample + fadeSamples, buffer.length);

  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src  = buffer.getChannelData(ch);
    const dest = out.getChannelData(ch);
    dest.set(src);

    for (let i = startSample; i < endSample; i++) {
      const progress = (i - startSample) / fadeSamples; // 0 → 1
      dest[i] = src[i] * progress;
    }
  }

  return out;
}

/**
 * Fade-out: linearly ramp gain from 1 → 0 over `duration` seconds starting
 * at `startTime`.
 */
export function applyFadeOut(buffer: AudioBuffer, params: FadeOutParams): AudioBuffer {
  const startSample = timeToSample(params.startTime, buffer.sampleRate);
  const fadeSamples = timeToSample(params.duration,  buffer.sampleRate);
  const endSample   = Math.min(startSample + fadeSamples, buffer.length);

  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src  = buffer.getChannelData(ch);
    const dest = out.getChannelData(ch);
    dest.set(src);

    for (let i = startSample; i < endSample; i++) {
      const progress = (i - startSample) / fadeSamples; // 0 → 1
      dest[i] = src[i] * (1 - progress);
    }
  }

  return out;
}

// ─── Waveform Peak Extraction ─────────────────────────────────────────────

/**
 * Downsample the first channel of an AudioBuffer into `numBuckets` peak
 * values (max absolute amplitude per bucket).  Used by the Canvas renderer.
 */
export function extractPeaks(
  buffer: AudioBuffer,
  numBuckets: number,
): Float32Array {
  const data        = buffer.getChannelData(0);
  const samplesPerBucket = buffer.length / numBuckets;
  const peaks       = new Float32Array(numBuckets);

  for (let b = 0; b < numBuckets; b++) {
    const from = Math.floor(b * samplesPerBucket);
    const to   = Math.floor((b + 1) * samplesPerBucket);
    let max = 0;
    for (let i = from; i < to; i++) {
      const abs = Math.abs(data[i]);
      if (abs > max) max = abs;
    }
    peaks[b] = max;
  }

  return peaks;
}
