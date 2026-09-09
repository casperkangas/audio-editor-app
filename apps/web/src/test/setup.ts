/**
 * src/test/setup.ts
 *
 * Vitest global setup – runs before every test file.
 * Provides a minimal AudioBuffer mock so edit-operation tests
 * can run in jsdom without a real Web Audio API.
 */

import '@testing-library/jest-dom';

// ─── Minimal AudioBuffer mock ─────────────────────────────────────────────
//
// jsdom does not implement Web Audio API.  The edit operations only need:
//   - new AudioBuffer({ numberOfChannels, length, sampleRate })
//   - buffer.getChannelData(ch) → Float32Array
//   - buffer.numberOfChannels, buffer.length, buffer.sampleRate, buffer.duration
//
// This mock satisfies those requirements.

class MockAudioBuffer {
  readonly sampleRate:       number;
  readonly length:           number;
  readonly numberOfChannels: number;
  private channels:          Float32Array[];

  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.sampleRate       = opts.sampleRate;
    this.length           = opts.length;
    this.numberOfChannels = opts.numberOfChannels;
    this.channels         = Array.from(
      { length: opts.numberOfChannels },
      () => new Float32Array(opts.length),
    );
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    if (channel < 0 || channel >= this.numberOfChannels) {
      throw new DOMException('channel index out of bounds');
    }
    return this.channels[channel];
  }
}

// Patch global so `new AudioBuffer(...)` works in tests
(globalThis as unknown as Record<string, unknown>).AudioBuffer = MockAudioBuffer;
