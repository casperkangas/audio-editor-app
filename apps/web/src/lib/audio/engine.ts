/**
 * lib/audio/engine.ts
 * Web Audio API wrapper: decode, play, pause, stop, seek.
 */

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped';
type PlayheadCb = (t: number) => void;
type StateCb    = (s: PlaybackState) => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startOffset  = 0;
  private ctxTimeAtStart = 0;
  private _state: PlaybackState = 'idle';
  private rafId: number | null = null;
  private playheadCbs = new Set<PlayheadCb>();
  private stateCbs    = new Set<StateCb>();

  private getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
    return this.ctx;
  }

  async loadArrayBuffer(ab: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.getCtx();
    const buf = await ctx.decodeAudioData(ab);
    this.buffer = buf;
    this.startOffset = 0;
    this._setState('idle');
    return buf;
  }

  loadBuffer(buf: AudioBuffer): void {
    this.stop();
    this.buffer = buf;
    this.startOffset = 0;
    this._setState('idle');
  }

  get decodedBuffer(): AudioBuffer | null { return this.buffer; }
  get duration(): number { return this.buffer?.duration ?? 0; }
  get state(): PlaybackState { return this._state; }
  get currentTime(): number { return this._playhead(); }

  play(from?: number): void {
    if (!this.buffer) return;
    const ctx = this.getCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    this._killSource();
    const offset = from !== undefined ? from : this.startOffset;
    this.startOffset     = Math.max(0, Math.min(offset, this.buffer.duration));
    this.ctxTimeAtStart  = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(ctx.destination);
    src.start(0, this.startOffset);
    src.onended = () => {
      if (this.source === src) { this.startOffset = 0; this._setState('stopped'); this._stopRaf(); this._notifyPlayhead(0); }
    };
    this.source = src;
    this._setState('playing');
    this._startRaf();
  }

  pause(): void {
    if (this._state !== 'playing') return;
    this.startOffset = this._playhead();
    this._killSource();
    this._setState('paused');
    this._stopRaf();
    this._notifyPlayhead(this.startOffset);
  }

  stop(): void {
    this.startOffset = 0;
    this._killSource();
    this._setState('stopped');
    this._stopRaf();
    this._notifyPlayhead(0);
  }

  seek(to: number): void {
    const was = this._state === 'playing';
    this.startOffset = Math.max(0, Math.min(to, this.buffer?.duration ?? 0));
    if (was) this.play(this.startOffset);
    else this._notifyPlayhead(this.startOffset);
  }

  onPlayhead(cb: PlayheadCb): () => void { this.playheadCbs.add(cb); return () => this.playheadCbs.delete(cb); }
  onStateChange(cb: StateCb): () => void  { this.stateCbs.add(cb);    return () => this.stateCbs.delete(cb);    }

  dispose(): void {
    this.stop();
    this._stopRaf();
    void this.ctx?.close();
    this.ctx = this.buffer = null;
  }

  private _playhead(): number {
    if (this._state !== 'playing' || !this.ctx) return this.startOffset;
    return Math.min(this.startOffset + (this.ctx.currentTime - this.ctxTimeAtStart), this.buffer?.duration ?? 0);
  }
  private _setState(s: PlaybackState) { this._state = s; this.stateCbs.forEach(cb => cb(s)); }
  private _notifyPlayhead(t: number)  { this.playheadCbs.forEach(cb => cb(t)); }
  private _startRaf() {
    this._stopRaf();
    const tick = () => { this._notifyPlayhead(this._playhead()); this.rafId = requestAnimationFrame(tick); };
    this.rafId = requestAnimationFrame(tick);
  }
  private _stopRaf() { if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; } }
  private _killSource() {
    if (this.source) { try { this.source.stop(); this.source.disconnect(); } catch { /* already stopped */ } this.source = null; }
  }
}

export const audioEngine = new AudioEngine();
