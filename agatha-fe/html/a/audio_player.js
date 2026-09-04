// audio_player.js
// Generic WebAudio-based player for streaming Float32 PCM chunks.
//
// This module is intentionally decoder-agnostic: callers are expected to
// provide already-decoded Float32Array chunks (e.g., from decode_pcm.js or
// decode_smart_adpcm.js). The player simply queues them for gapless playback.

/**
 * Simple streaming audio player.
 *
 * Usage:
 *   const player = new AudioPlayer({ sampleRate: 44100 });
 *   player.scheduleChunk(float32Chunk);  // call repeatedly as chunks arrive
 *
 *   // Optional callbacks for integration with lip-sync, UI, etc.:
 *   const player = new AudioPlayer({
 *     onStart() { ...first chunk scheduled... },
 *     onEnd()   { ...all queued chunks finished... },
 *   });
 */
export class AudioPlayer {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.sampleRate=44100] - Desired output sample rate.
   * @param {number} [opts.numChannels=1] - Number of channels (mono only used).
   * @param {Function} [opts.onStart] - Called when playback of a batch begins.
   * @param {Function} [opts.onEnd] - Called when the last scheduled source ends.
   */
  constructor(opts = {}) {
    const {
      sampleRate = 44100,
      numChannels = 1,
      onStart = null,
      onEnd = null,
    } = opts;

    this.sampleRate = sampleRate;
    this.numChannels = numChannels;
    this.onStart = typeof onStart === "function" ? onStart : null;
    this.onEnd = typeof onEnd === "function" ? onEnd : null;

    this.audioCtx = null;
    this.playCursor = 0; // in seconds, relative to audioCtx.currentTime
    this._sources = new Set();
  }

  /**
   * Ensure there is an AudioContext, creating one if needed.
   * Tries to resume if it is suspended.
   * @returns {AudioContext}
   */
  _ensureContext() {
    if (!this.audioCtx) {
      const AC = (typeof window !== "undefined" &&
                  (window.AudioContext || window.webkitAudioContext)) || null;
      if (!AC) {
        throw new Error("Web Audio API not supported in this environment");
      }
      this.audioCtx = new AC({ sampleRate: this.sampleRate });
      this.playCursor = this.audioCtx.currentTime;
    }

    // Best-effort resume; ignore errors.
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }

    return this.audioCtx;
  }

  /**
   * Schedule a chunk of Float32 PCM for playback.
   *
   * @param {Float32Array} floatPcm - Decoded PCM samples in [-1, 1].
   */
  scheduleChunk(floatPcm) {
    if (!floatPcm || !floatPcm.length) return;

    const ctx = this._ensureContext();

    const buffer = ctx.createBuffer(
      this.numChannels,
      floatPcm.length,
      ctx.sampleRate
    );
    buffer.getChannelData(0).set(floatPcm);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (this.playCursor < now) {
      this.playCursor = now;
    }

    const isFirstSource = this._sources.size === 0;
    this._sources.add(source);

    source.onended = () => {
      this._sources.delete(source);
      if (this._sources.size === 0 && typeof this.onEnd === "function") {
        this.onEnd();
      }
    };

    if (isFirstSource && typeof this.onStart === "function") {
      this.onStart();
    }

    source.start(this.playCursor);
    this.playCursor += buffer.duration;
  }

  /**
   * Stop all currently scheduled sources and reset the internal play cursor.
   * Does not close the AudioContext.
   */
  reset() {
    if (!this.audioCtx) return;

    for (const src of this._sources) {
      try {
        src.stop();
      } catch (e) {
        // ignore
      }
    }
    this._sources.clear();
    this.playCursor = this.audioCtx.currentTime;
  }

  /**
   * Close the underlying AudioContext and release resources.
   * After calling this, the player can be reused; a new context
   * will be created on the next scheduleChunk call.
   */
  async close() {
    if (this.audioCtx) {
      try {
        await this.audioCtx.close();
      } catch (e) {
        // ignore
      }
      this.audioCtx = null;
      this._sources.clear();
      this.playCursor = 0;
    }
  }
}

