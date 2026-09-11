/**
 * lib/audio/engine.ts
 *
 * Thin wrapper around the Web Audio API that handles:
 *   - Decoding an ArrayBuffer → AudioBuffer
 *   - Playback (play / pause / stop / seek)
 *   - Reporting current playhead position via a requestAnimationFrame loop
 *
 * AudioEngine is a plain class that React hooks wrap; it is not itself a React
 * component and contains no React imports.
 */

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped';

export type PlayheadCallback = (currentTime: number) => void;
export type StateChangeCallback = (state: PlaybackState) => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;

  /** Offset within the buffer where playback started, in seconds */
  private startOffset: number = 0;
  /** AudioContext.currentTime when play() was called */
  private contextTimeAtStart: number = 0;

  private _state: PlaybackState = 'idle';
  private rafId: number | null = null;

  private playheadListeners: Set<PlayheadCallback> = new Set();
  private stateListeners:    Set<StateChangeCallback> = new Set();

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  /** Load an ArrayBuffer (e.g. from FileReader) and decode it. */
  async loadArrayBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx    = this.getContext();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    this.buffer        = buffer;
    this.startOffset   = 0;
    this.contextTimeAtStart = 0;
    this._setState('idle');
    return buffer;
  }

  /** Load an AudioBuffer that was already decoded (e.g. after an edit operation). */
  loadBuffer(buffer: AudioBuffer): void {
    this.stop();
    this.buffer      = buffer;
    this.startOffset = 0;
    this._setState('idle');
  }

  /** Release all resources. */
  dispose(): void {
    this.stop();
    this._cancelRaf();
    void this.ctx?.close();
    this.ctx    = null;
    this.buffer = null;
  }

  // ─── Transport controls ──────────────────────────────────────────────────

  play(fromSeconds?: number): void {
    if (!this.buffer) return;
    const ctx = this.getContext();

    // Resume if the context is suspended (browser auto-suspend policy)
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    // Stop any existing source node
    this._disconnectSource();

    const offset = fromSeconds !== undefined ? fromSeconds : this.startOffset;
    this.startOffset        = Math.max(0, Math.min(offset, this.buffer.duration));
    this.contextTimeAtStart = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(ctx.destination);
    src.start(0, this.startOffset);
    src.onended = () => {
      // Only auto-stop if this node is still active (not replaced by a new play)
      if (this.sourceNode === src) {
        this.startOffset = 0;
        this._setState('stopped');
        this._cancelRaf();
        this._notifyPlayhead(0);
      }
    };

    this.sourceNode = src;
    this._setState('playing');
    this._startRaf();
  }

  pause(): void {
    if (this._state !== 'playing') return;
    // Snapshot the playhead before killing the source
    this.startOffset = this._currentPlayheadSeconds();
    this._disconnectSource();
    this._setState('paused');
    this._cancelRaf();
    this._notifyPlayhead(this.startOffset);
  }

  stop(): void {
    this.startOffset = 0;
    this._disconnectSource();
    this._setState('stopped');
    this._cancelRaf();
    this._notifyPlayhead(0);
  }

  /** Seek to a specific time (works while playing or paused). */
  seek(toSeconds: number): void {
    const wasPlaying = this._state === 'playing';
    this.startOffset = Math.max(0, Math.min(toSeconds, this.buffer?.duration ?? 0));
    if (wasPlaying) {
      this.play(this.startOffset);
    } else {
      this._notifyPlayhead(this.startOffset);
    }
  }

  // ─── State ───────────────────────────────────────────────────────────────

  get state(): PlaybackState {
    return this._state;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get currentTime(): number {
    return this._currentPlayheadSeconds();
  }

  onPlayhead(cb: PlayheadCallback): () => void {
    this.playheadListeners.add(cb);
    return () => this.playheadListeners.delete(cb);
  }

  onStateChange(cb: StateChangeCallback): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private _currentPlayheadSeconds(): number {
    if (this._state !== 'playing' || !this.ctx) return this.startOffset;
    const elapsed = this.ctx.currentTime - this.contextTimeAtStart;
    return Math.min(this.startOffset + elapsed, this.buffer?.duration ?? 0);
  }

  private _setState(state: PlaybackState): void {
    this._state = state;
    this.stateListeners.forEach(cb => cb(state));
  }

  private _notifyPlayhead(time: number): void {
    this.playheadListeners.forEach(cb => cb(time));
  }

  private _startRaf(): void {
    this._cancelRaf();
    const tick = () => {
      this._notifyPlayhead(this._currentPlayheadSeconds());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private _cancelRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private _disconnectSource(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // May already be stopped
      }
      this.sourceNode = null;
    }
  }
}

/** Singleton – shared across the whole app. */
export const audioEngine = new AudioEngine();
