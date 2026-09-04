# Updates for this fork

This fork of MeloTTS focuses on making the engine easier to use in **real-time, interactive, and avatar/agent** scenarios.

## Highlights

- **Streaming WebSocket TTS**
  - New WebSocket server that streams audio chunks to clients.
  - HTML/JS demo clients in `html/` show how to send text and play audio as it arrives.

- **Iterator-style TTS API**
  - New `TTS.tts_iter(...)` in `melo/api.py` yields `(audio_segment, phoneme_metadata)` per segment.
  - Designed for pipelines where you want to start using audio before the full utterance is done.

- **Phoneme timings in JSON**
  - Each phoneme now comes with timing information derived from the model's internal frame durations:
    - `start_ms`, `duration_ms`, `end_ms`: integer milliseconds (backwards compatible with older code).
    - `start_us`, `duration_us`, `end_us`: integer microseconds for higher-resolution alignment.
  - Useful for lip-sync, animation systems, subtitles, and tools that need phone-level alignment.

- **Inline expression / animation tags**
  - Text can contain special inline tags (for expressions, animation cues, or other events).
  - The G2P/phoneme pipeline tracks these and emits them in the phoneme metadata as `tags`.
  - Lets you drive expressions, gestures, or other in-engine events in sync with the spoken audio.

## Other changes

- Added small test/utility scripts under `melo/` to exercise the iterator and WebSocket server.
- Added HTML/JS test clients and helper scripts under `html/`.
- Added a minimal `pyproject.toml` for packaging and dependency management.

For a full code-level diff against upstream `main`, you can still run:

```bash
git diff main dev3
```
