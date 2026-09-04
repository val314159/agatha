
console.log('ttsaudiomsg.js loaded..! 🎵');

export class TTSAudioManager {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate; // Matches melo/ws.py `sr`
    this.audioCtx = null;
    this.playbackEndTime = 0;
    this.utteranceStartAudioTime = null; // AudioContext.currentTime when this utterance's first chunk starts
    this.pendingWordTimings = null; // holds the next timings batch until its PCM arrives
    this.words = [];
    this.wordIndex = -1;
    this.loopRunning = false;
    this.onStartPhoneme = null;
    this.onEndUtterance = null;
    this.onStartUtterance = null;
  }

  startLoop() {
    const tick = () => {
      if (!this.loopRunning) return;
      const nowMs = (this.getCurrentTime() - this.utteranceStartAudioTime) * 1000;
      console.log('tick', nowMs);
      if (this.wordIndex < 0) {
        this.wordIndex = 0;
        if (this.wordIndex >= this.words.length) {
          this.wordIndex = -2;
          console.warn("utterance OVER!")
          this.stopLoop();
          return this.onEndUtterance?.(0);
        }
        console.warn("moved to word 000", this.words[this.wordIndex]);
        this.onStartPhoneme?.(this.wordIndex, this.words[this.wordIndex]);
      } else {
        const currentWord = this.words[this.wordIndex];
        if (currentWord.end_ms !== undefined) {
          const endMs = currentWord.end_ms;
          if (nowMs >= endMs) {
            this.wordIndex++;
            if (this.wordIndex >= this.words.length) {
              this.wordIndex = -2;
              console.warn("utterance OVER!")
              this.stopLoop();
              return this.onEndUtterance?.(endMs);
            }
            console.warn("moved to word", this.wordIndex, this.words[this.wordIndex]);
            this.onStartPhoneme?.(this.wordIndex, this.words[this.wordIndex]);
          }
        } else {
          const endMs = (this.getPlaybackEndTime() - this.utteranceStartAudioTime) * 1000;
          if (nowMs >= endMs) {
            this.wordIndex = -2;
            console.warn("utterance OVER!")
            this.stopLoop();
            return this.onEndUtterance?.(endMs);
          }
        }
      }
      requestAnimationFrame(tick);
    };
    if (this.loopRunning || !this.audioCtx) return;
    this.loopRunning = true;
    requestAnimationFrame(tick);
    this.onStartUtterance?.();
  }

  stopLoop() {
    this.loopRunning = false;
  }

  isLoopRunning() {
    return this.loopRunning;
  }

  ensureContext() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext || AudioContext;
      this.audioCtx = new AC({ sampleRate: this.sampleRate });
      this.playbackEndTime = this.audioCtx.currentTime;
    }
    if (this.audioCtx.state === "suspended") {
      return this.audioCtx.resume();
    }
    return Promise.resolve();
  }

  schedulePcmChunk(arrayBuffer) {
    if (!this.audioCtx) return null;

    const pcm16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i += 1) {
      float32[i] = pcm16[i] / 32768;
    }

    const buffer = this.audioCtx.createBuffer(1, float32.length, this.sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);

    const startTime = Math.max(this.playbackEndTime, this.audioCtx.currentTime);
    source.start(startTime);
    this.playbackEndTime = startTime + buffer.duration;

    // On the first chunk of an utterance, establish the audio-clock reference point.
    if (this.utteranceStartAudioTime == null) {
      this.utteranceStartAudioTime = startTime;
    }

    // Apply any pending timings batch for this chunk now that its audio is scheduled.
    if (this.pendingWordTimings) {
      const batch = this.pendingWordTimings;
      this.pendingWordTimings = null;

      // Compute this chunk's base in utterance-relative ms from the audio clock.
      const baseMs = (startTime - this.utteranceStartAudioTime) * 1000;
      this.applyWordTimings(batch, baseMs);

      this.startLoop();
    } else {
      console.error("schedulePcmChunk: No pending word timings for this chunk");
    }
    return source;
  }

  getContext() {
    return this.audioCtx;
  }

  getCurrentTime() {
    return this.audioCtx ? this.audioCtx.currentTime : 0;
  }

  getPlaybackEndTime() {
    return this.playbackEndTime;
  }

  getUtteranceStartTime() {
    return this.utteranceStartAudioTime ?? 0;
  }

  isAwaitingFirstAudio() {
    return this.utteranceStartAudioTime == null;
  }

  resetWords() {
    this.words = [];
    this.wordIndex = -1;
    this.utteranceStartAudioTime = null;
    this.pendingWordTimings = null;
  }

  addPendingWordTimings(wordDurList) {
    if (this.pendingWordTimings === null) {
      this.pendingWordTimings = wordDurList;
    } else {
      console.error('addPendingWordTimings called when pendingWordTimings is not null, ignoring new timings');
    }
  }

  applyWordTimings(wordDurList, baseMs) {
    const newWords = [];
    wordDurList.forEach((entry) => {
      const wordEntry = { ...entry };
      const localStart = entry.start_ms;
      const localEnd = entry.end_ms;

      let globalStart = null;
      if (localStart != null && !Number.isNaN(localStart)) {
        globalStart = baseMs + localStart;
        wordEntry.start_ms = globalStart;

        const prev = this.words.at(-1);
        if (prev && (prev.end_ms == null || Number.isNaN(prev.end_ms))) {
          prev.end_ms = globalStart;
        }
      }

      if (localEnd != null && !Number.isNaN(localEnd)) {
        wordEntry.end_ms = baseMs + localEnd;
      }

      this.words.push(wordEntry);
      newWords.push(wordEntry);
    });
    this.onApplyTiming?.(newWords);
    return newWords;
  }
}
