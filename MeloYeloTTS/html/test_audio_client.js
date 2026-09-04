/**
 * Simple browser client for ws://<host>/audiows.
 * - Sends plain-text prompts.
 * - Receives JSON word timings (text frames) and little-endian PCM_16 audio chunks (binary frames).
 * - Streams playback via Web Audio.
 */

import { TTSAudioManager } from './ttsaudiomgr.js';

console.log('test_audio_client5.js loaded..! 🎵');

const WS_URL = `ws://${location.host}/audiows`;

const ttsAudioManager = new TTSAudioManager();

const state = {
  ws: null,
  connecting: false,
};

const els = {};
const transcript = {
  words: [],
  currentWord: null,
  streamEnded: false,
};

function $(id) {
  return document.getElementById(id);
}

function init() {
  console.log('init');
  els.status = $("connection-status");
  els.statusText = $("status-text");
  els.prompt = $("tts-input");
  els.log = $("log-lines");
  els.timings = $("timings");
  els.connectBtn = $("connect-btn");
  els.sendBtn = $("send-btn");

  els.transcriptStream = $("transcript-stream");
  els.transcriptStatus = $("transcript-status");
  els.transcriptProgress = $("transcript-progress");
  els.clearTranscript = $("clear-transcript");

  els.connectBtn.addEventListener("click", connect);
  els.sendBtn.addEventListener("click", sendPrompt);
  els.clearTranscript.addEventListener("click", clearTranscript);

  connect();
}

function setStatus(text, stateAttr) {
  console.log('setStatus', text, stateAttr);
  els.statusText.textContent = text;
  els.status.dataset.state = stateAttr;
}

function appendLog(text) {
  console.log('appendLog', text);
  const line = document.createElement("div");
  line.className = "log-entry";
  line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  els.log.prepend(line);
}

function applyTiming(processedWords) {
  console.log('applyTiming', processedWords);

  const li = document.createElement("li");
  li.textContent = processedWords
    .map((entry) => {
      const displayEnd = entry.end_ms;
      return `${entry.word ?? "[pause]"} (${entry.start_ms?.toFixed?.(0) ?? "?"}–${displayEnd?.toFixed?.(0) ?? "?"} ms)`;
    })
    .join(", ");
  els.timings.prepend(li);
  while (els.timings.children.length > 40) {
    els.timings.removeChild(els.timings.lastChild);
  }

  const fragment = document.createDocumentFragment();
  processedWords.forEach((entry) => {
    const uiWord = {
      ...entry,
      element: createTranscriptWord(entry.word),
      spoken: false,
    };
    transcript.words.push(uiWord);
    fragment.appendChild(uiWord.element);
  });
  els.transcriptStream.appendChild(fragment);
  els.transcriptStream.scrollTop = els.transcriptStream.scrollHeight;
  els.transcriptStatus.textContent = "Streaming…";
  updateTranscriptProgress();
}

function appendTiming(wordDurList) {
  console.log('appendTiming', wordDurList);
  ttsAudioManager.addPendingWordTimings(wordDurList);
}

function ensureAudioContext() {
  console.log('ensureAudioContext');
  return ttsAudioManager.ensureContext();
}

function schedulePcmChunk(arrayBuffer) {
  console.log('schedulePcmChunk', arrayBuffer.byteLength);
  ttsAudioManager.schedulePcmChunk(arrayBuffer);
}

function connect() {
  console.log('connect');
  if (state.connecting) return;
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.close(1000, "Reconnecting");
  }
  
  appendLog("Opening WebSocket…");
  setStatus("Connecting…", "connecting");
  state.connecting = true;
  
  const ws = new WebSocket(WS_URL);
  ws.binaryType = "arraybuffer";
  
  ws.onopen = () => {
    state.connecting = false;
    setStatus("Connected", "connected");
    appendLog("WebSocket connected.");
  };
  
  ws.onmessage = (evt) => handleMessage(evt.data);
  
  ws.onerror = (evt) => {
    appendLog(`WebSocket error: ${evt.message || evt.type}`);
  };
  
  ws.onclose = (evt) => {
    if (ws !== state.ws) return;
    if (!transcript.streamEnded) {
      console.log('Setting streamEnded to true in onclose');
      transcript.streamEnded = true;
    }
    state.ws = null;
    state.connecting = false;
    setStatus("Disconnected", "disconnected");
    appendLog(`Socket closed (${evt.code}).`);
  };
  
  state.ws = ws;
}

function handleMessage(data) {
  console.log('handleMessage', data);
  if (typeof data === "string") {
    if (!data) return;
    if (data === "EOF") {
      appendLog("Server signaled end of stream.");
      transcript.streamEnded = true;
      return;
    }
    
    try {
      const timings = JSON.parse(data);
      if (Array.isArray(timings)) {
        appendTiming(timings);
      } else {
        appendLog(`Received text frame: ${data}`);
      }
    } catch {
      appendLog(`Non‑JSON text frame: ${data}`);
    }
    return;
  }
  
  // Binary frame (ArrayBuffer).
  ensureAudioContext()
  .then(() => schedulePcmChunk(data))
  .catch((err) => appendLog(`AudioContext error: ${err.message}`));
}

function sendPrompt() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    appendLog("Cannot send: socket not open.");
    return;
  }
  
  const text = els.prompt.value.trim();
  if (!text) {
    appendLog("Please enter text before sending.");
    return;
  }
  
  ensureAudioContext()
  .then(() => {
    appendLog(`Sending prompt (${text.length} chars)…`);
    resetTranscript();
    state.ws.send(text);
  })
  .catch((err) => appendLog(`AudioContext error: ${err.message}`));
}

function createTranscriptWord(word) {
  console.log('createTranscriptWord', word);
  const span = document.createElement("span");
  span.className = "transcript-word";
  span.textContent = word || "•";
  return span;
}

function resetTranscript() {
  console.log('resetTranscript');
  ttsAudioManager.stopLoop();
  ttsAudioManager.resetWords();
  transcript.words = [];
  transcript.currentWord = null;
  transcript.streamEnded = false;
  els.transcriptStream.textContent = "";
  els.transcriptStatus.textContent = "Awaiting audio…";
  els.transcriptProgress.textContent = "";
}

function clearTranscript() {
  console.log('clearTranscript');
  resetTranscript();
  appendLog("Transcript cleared.");
}

function updateTranscriptProgress() {
  console.log('updateTranscriptProgress');
  const spoken = transcript.words.filter((w) => w.spoken).length;
  const total = transcript.words.length;
  els.transcriptProgress.textContent = total
  ? `${spoken} / ${total} words`
  : "";
}

function startTranscript() {
  console.log('startTranscript');
  const ctx = ttsAudioManager.getContext();
  if (!ctx) {
    console.warn('Transcript cannot start: audio context not ready');
    return false;
  }
  els.transcriptStatus.textContent = "Playing…";
  return true;
}

function highlightTranscript(wordIndex, word) {
  console.log('highlightTranscript', wordIndex, word);
  
  const ctx = ttsAudioManager.getContext();
  if (!ctx || ttsAudioManager.isAwaitingFirstAudio()) return;
  
  const currentTime = ttsAudioManager.getCurrentTime();
  const utteranceStart = ttsAudioManager.getUtteranceStartTime();
  const elapsedMs = (currentTime - utteranceStart) * 1000;
  
  const processTranscriptWords = (word) => {
    const start = word.start_ms ?? Number.NEGATIVE_INFINITY;
    const end = word.end_ms ?? Number.POSITIVE_INFINITY;
    const el = word.element;
    if (!el) return;
    
    const isActive = elapsedMs >= start && elapsedMs < end;
    const isSpoken = elapsedMs >= end;
    el.classList.toggle("active", isActive);
    el.classList.toggle("spoken", isSpoken);
    word.spoken = isSpoken;
    
    if (isActive && transcript.currentWord !== word.element) {
      transcript.currentWord = word.element;
      console.log(
        `[transcript] active word: "${word.word ?? "[pause]"}" @ ${start.toFixed?.(
          0
        ) ?? start}ms`
      );
    }
  };
  
  // transcript.words.forEach(processTranscriptWords);
  if (wordIndex > 0) {
    processTranscriptWords(transcript.words[wordIndex - 1]);
  }
  processTranscriptWords(transcript.words[wordIndex]);
  updateTranscriptProgress();
}

function endTranscript(end_ms) {
  if (transcript.words.length > 0) {
    const lastIndex = transcript.words.length - 1;
    const lastWord = transcript.words[lastIndex];
    // Only fill in if missing / NaN
    if (lastWord.end_ms == null || Number.isNaN(lastWord.end_ms)) {
      lastWord.end_ms = end_ms;
    }
    // Optionally reuse highlighting logic once at the very end:
    highlightTranscript(lastIndex, lastWord);
  }
  els.transcriptStatus.textContent = "Completed";
}

ttsAudioManager.onApplyTiming = applyTiming;
ttsAudioManager.onStartUtterance = startTranscript;
ttsAudioManager.onStartPhoneme = highlightTranscript;
ttsAudioManager.onEndUtterance = endTranscript;

window.addEventListener("DOMContentLoaded", init);