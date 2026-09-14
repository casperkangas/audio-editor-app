/**
 * lib/editing/operations.ts
 * Pure functions that transform AudioBuffers non-destructively.
 * Each returns a NEW AudioBuffer; the original is never mutated.
 */

import type {
  TrimParams, CutParams, SplitParams,
  VolumeParams, FadeInParams, FadeOutParams,
} from '../types';

function timeToSample(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

export function sliceBuffer(src: AudioBuffer, startSample: number, endSample: number): AudioBuffer {
  const s = Math.max(0, Math.min(startSample, src.length));
  const e = Math.max(s, Math.min(endSample, src.length));
  const out = new AudioBuffer({ numberOfChannels: src.numberOfChannels, length: e - s, sampleRate: src.sampleRate });
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    out.getChannelData(ch).set(src.getChannelData(ch).subarray(s, e));
  }
  return out;
}

export function concatBuffers(a: AudioBuffer, b: AudioBuffer): AudioBuffer {
  if (a.sampleRate !== b.sampleRate || a.numberOfChannels !== b.numberOfChannels)
    throw new Error('concatBuffers: mismatched sampleRate or numberOfChannels');
  const out = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: a.length + b.length, sampleRate: a.sampleRate });
  for (let ch = 0; ch < a.numberOfChannels; ch++) {
    const d = out.getChannelData(ch);
    d.set(a.getChannelData(ch), 0);
    d.set(b.getChannelData(ch), a.length);
  }
  return out;
}

export function applyTrim(buf: AudioBuffer, p: TrimParams): AudioBuffer {
  return sliceBuffer(buf, timeToSample(p.startTime, buf.sampleRate), timeToSample(p.endTime, buf.sampleRate));
}

export function applyCut(buf: AudioBuffer, p: CutParams): AudioBuffer {
  const before = sliceBuffer(buf, 0, timeToSample(p.startTime, buf.sampleRate));
  const after  = sliceBuffer(buf, timeToSample(p.endTime, buf.sampleRate), buf.length);
  if (before.length === 0) return after;
  if (after.length  === 0) return before;
  return concatBuffers(before, after);
}

export function applySplit(buf: AudioBuffer, p: SplitParams): [AudioBuffer, AudioBuffer] {
  const s = timeToSample(p.at, buf.sampleRate);
  return [sliceBuffer(buf, 0, s), sliceBuffer(buf, s, buf.length)];
}

export function applyVolume(buf: AudioBuffer, p: VolumeParams): AudioBuffer {
  const s    = timeToSample(p.startTime, buf.sampleRate);
  const e    = timeToSample(p.endTime, buf.sampleRate);
  const gain = Math.max(0, p.gain);
  const out  = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: buf.length, sampleRate: buf.sampleRate });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src  = buf.getChannelData(ch);
    const dest = out.getChannelData(ch);
    dest.set(src);
    for (let i = s; i < e && i < buf.length; i++) dest[i] = src[i] * gain;
  }
  return out;
}

export function applyFadeIn(buf: AudioBuffer, p: FadeInParams): AudioBuffer {
  const s    = timeToSample(p.startTime, buf.sampleRate);
  const fade = timeToSample(p.duration, buf.sampleRate);
  const e    = Math.min(s + fade, buf.length);
  const out  = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: buf.length, sampleRate: buf.sampleRate });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src  = buf.getChannelData(ch);
    const dest = out.getChannelData(ch);
    dest.set(src);
    for (let i = s; i < e; i++) dest[i] = src[i] * ((i - s) / fade);
  }
  return out;
}

export function applyFadeOut(buf: AudioBuffer, p: FadeOutParams): AudioBuffer {
  const s    = timeToSample(p.startTime, buf.sampleRate);
  const fade = timeToSample(p.duration, buf.sampleRate);
  const e    = Math.min(s + fade, buf.length);
  const out  = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: buf.length, sampleRate: buf.sampleRate });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src  = buf.getChannelData(ch);
    const dest = out.getChannelData(ch);
    dest.set(src);
    for (let i = s; i < e; i++) dest[i] = src[i] * (1 - (i - s) / fade);
  }
  return out;
}

/** Downsample to `numBuckets` peak values for waveform display */
export function extractPeaks(buf: AudioBuffer, numBuckets: number): Float32Array {
  const data = buf.getChannelData(0);
  const spb  = buf.length / numBuckets;
  const out  = new Float32Array(numBuckets);
  for (let b = 0; b < numBuckets; b++) {
    const from = Math.floor(b * spb), to = Math.floor((b + 1) * spb);
    let max = 0;
    for (let i = from; i < to; i++) { const a = Math.abs(data[i]); if (a > max) max = a; }
    out[b] = max;
  }
  return out;
}
