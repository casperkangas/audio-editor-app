/**
 * tests/setup.ts
 * Global test setup — runs before every test file.
 * Provides a minimal AudioBuffer mock for jsdom (Web Audio API not available there).
 */

import '@testing-library/jest-dom'

class MockAudioBuffer {
  readonly sampleRate: number
  readonly length: number
  readonly numberOfChannels: number
  private channels: Float32Array[]

  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.sampleRate       = opts.sampleRate
    this.length           = Math.max(0, opts.length)
    this.numberOfChannels = opts.numberOfChannels
    this.channels         = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(this.length))
  }

  get duration() { return this.length / this.sampleRate }

  getChannelData(ch: number): Float32Array {
    if (ch < 0 || ch >= this.numberOfChannels) throw new DOMException('channel index out of bounds')
    return this.channels[ch]
  }
}

;(globalThis as unknown as Record<string, unknown>).AudioBuffer = MockAudioBuffer
