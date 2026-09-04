# AIF Agent Notes

This repo is the browser frontend for the Agatha/Ava avatar app. It is a static
ES-module app (`index.html` plus JavaScript files) that depends on backend
services for auth, WebSocket pub/sub, voice recognition, and audio generation.

## MemoriesDB Constraints

This repo uses MemoriesDB from a sibling checkout at `../memoriesdb`.

Before changing code that stores memories, conversations, realtime messages, or
service startup, read:

1. `../memoriesdb/docs/ai-quickstart.md`
2. `../memoriesdb/docs/db-library.md`
3. `../memoriesdb/docs/hub-protocol.md`
4. `../memoriesdb/docs/python-agents.md`
5. `../memoriesdb/docs/auth-and-cookies.md`
6. `../memoriesdb/docs/process-readiness.md`

Use stable MemoriesDB integration surfaces only:

- DB library: `from memoriesdb import db`
- Pub/sub hub: protocol documented in `../memoriesdb/docs/hub-protocol.md`
- Python agents: `from memoriesdb.agent import SubAgentBase`
- Browser cookie auth and internal-agent auth: documented in
  `../memoriesdb/docs/auth-and-cookies.md`
- Process readiness: ready files documented in
  `../memoriesdb/docs/process-readiness.md`

Do not import from `memoriesdb.lib.*` or `memoriesdb.services.*` unless the task
is to modify MemoriesDB itself.

Treat MemoriesDB as an external service provided by the sibling repo. Do not add
startup or install instructions here; `pyproject.toml` is the dependency source
of truth.

Wait for the hub before opening a WebSocket:

```python
from pidwatcher import PidFileWatcher

PidFileWatcher("hub.ready").wait()
```

Wait for DB service commands:

```python
from pidwatcher import PidFileWatcher

PidFileWatcher("hub.ready", "dbs.ready").wait()
```

## Current App Shape

- Entry point: `index.html` dynamically imports `application.js?t=...` and
  assigns the instance to `window._`. There is no local bundler or package file
  in this directory; browser dependencies come from CDN import maps.
- Main coordinator: `application.js` exports `Application`, which extends
  `PubSubApp`. It owns startup, WebSocket connection, runtime state, turn state,
  mic streaming, PCM playback, lip sync, model loading, UI, and message history.
- WebSocket client: `pubSubApp.js` connects to `BASE_URL/ws` with channels
  derived from `OUT_CH`, `OUT_CH2`, and `OUT_CH3`. It sends JSON pub messages and
  raw channel/content pairs for microphone audio. It reconnects automatically
  unless the close reason is `auth_failed`, in which case it redirects to
  `/login.html`.
- Runtime channels in `Application`: `IN_CH = "sup-in"`, `OUT_CH = "sup-out"`,
  `OUT_CH2 = "aud-out-bin"`, `OUT_CH3 = "aud-out-ctl"`, and
  `VREC_CH = "vrec-in::"`.
- URLs: on localhost, `BASE_URL0` and `BASE_URL` point at
  `http://localhost:5002`; `BASE_URL1` points at `http://localhost:1212`.
  Otherwise they use `location.origin`.
- Auth/session: startup shows `#auth-gate` until a WebSocket `initialize` message
  arrives. `Application.incomingMessage()` stores `uuid`, `session_id`, and
  `conversation` from server params or the `?conversation=` URL param, then hides
  the auth gate.

## Voice, Turns, and Audio

- Voice capture is `voiceRecog.js`, not the older `voiceRec.js` described in
  `ARCHITECTURE.md`. It uses `getUserMedia` with echo cancellation in `aec.js`,
  creates a `ScriptProcessorNode`, converts Float32 mic frames to Int16, and
  publishes raw frames to `VREC_CH`.
- `VoiceRecog.startStreaming()` sends a JSON control message
  `{ type: "voice_recog_control", event: "start", uuid, session_id,
  conversation }`, then sends the latest audio chunk as preroll.
- `VoiceRecog.stopStreaming()` marks postroll; the next audio process callback
  sends one final chunk and a stop/finalize control message.
- Convo mode values are `"sleep"`, `"idle"`, and `"active"`. `VoiceRecog` sends
  `set_convo_mode` controls to the backend whenever `Application` changes mode
  or syncs on initialize/WebSocket open.
- `TurnMachine` currently starts in `PUSH_TO_TALK` mode. Main states are
  `WAITING_FOR_USER_TURN`, `CAPTURING_USER_UTTERANCE`,
  `WAITING_FOR_ASSISTANT`, and `PLAYING_ASSISTANT_SPEECH`.
- PTT is wired through the Hold To Talk button and `Ctrl+M`. Pressing PTT
  promotes convo mode to `active`, starts capture, and releasing PTT stops
  capture and restores the previous convo mode.
- Assistant audio is currently the binary PCM path. WebSocket binary data is
  decoded by `decode_pcm.js`, filtered by a small energy threshold, and scheduled
  by `audio_player.js`. `AudioPlayer` drives `LipSyncState.onstart/onend()` via
  callbacks.

## Rendering and Avatar

- `sceneRenderer.js` owns Three.js setup, OrbitControls, VRM/GLTF loading, FBX
  animation loading/retargeting, expressions, and camera framing.
- `animate.js` owns the global animation loop, idle movement, blinking, eye
  darts, head glances, lip sync updates, keyframe dance updates, pending avatar
  updates, and `currentVRM.update()`.
- `LipSyncState` only tracks timing and mouth targets. Browser speech synthesis
  was removed; `startSpeaking()` is only a manual animation stub.
- `Blinker` applies blink expressions to VRM 1.x expression managers or VRM 0.x
  blend shape proxies.
- URL model selection is in `urlParams.js`: default is `/models/avaAvatar.vrm`;
  supported aliases include `?vrm=ava`, `?vrm=blockman`, and constraint/twist
  values. Custom absolute/rooted paths are accepted.

## UI and Persistence

- `ui.js` wires DOM controls, keyboard shortcuts, debug feed, runtime state
  strip, layout switching, model loading, expressions, dance buttons, typed text,
  and PTT.
- Conversation history is local-only browser persistence in
  `messageHistory.js`, using `localStorage["conversationHistory"]`; it does not
  write to MemoriesDB directly.
- `#text-input` and `#tts-input` both send typed text through
  `app.talkToAvatar(text)`. Despite the `tts` name, this path sends a user turn
  to the backend rather than local browser TTS.
- Layout is controlled by `body.layout-portrait` and `body.layout-landscape` in
  `style.css`. `UrlParams.updateUrlParam()` exists but layout/model changes do
  not currently persist to the URL.

## Dance and Animation Notes

- FBX/Mixamo animation buttons in `ui.js` call
  `sceneRenderer.loadFBX("/models/....fbx", app)`.
- Keyframe dance buttons dynamically import `danceData.js` and run through
  `DanceFrameSystem` from `danceFormat.js`.
- `danceSystem.js` is a separate procedural dance system and is not currently
  imported by the app.
- `DANCE.md` is the best conceptual doc for keyframe animation format, but
  `danceFormat.js` is the source of truth.

## Known Stale Docs and Gotchas

- `ARCHITECTURE.md` and `classDiagram.html` are stale in several places. They
  still describe `TextToSpeech`, `Voice`, `VoiceMgr`, and `VoiceRec`, but those
  modules are absent in the current checkout.
- `Application.incomingMessage()` still calls `this.generateAudio(params.url)`
  for `params.type === "audio"`, but `generateAudio()` is not defined in the
  current `Application`. The currently working audio path appears to be binary
  PCM via `params.type === "audio_pcm"` plus WebSocket binary chunks.
- `ui.js` references `this.app.stopAvatarSpeech()` for `Ctrl+.` and
  `this.app.enterContinuousMode()` for `Ctrl+,`; neither method exists in the
  current `Application`.
- `danceFormat.js` and `danceSystem.js` try to toggle idle animation through
  `window.app`, but `index.html` assigns the app to `window._`. Unless another
  script creates `window.app`, those idle toggles are no-ops.
- `sceneRenderer.js` defines `setupLighting()` twice; the second definition at
  the bottom overrides the first with the same implementation.
- `MessageHistory.updateDisplay()` assumes `#history-list` exists and does not
  null-check it.
- `messageHistory.add()` uses `innerHTML` with message text. Be careful with
  untrusted text if changing message rendering.

## Practical Edit Guidance

- Prefer the current code over `ARCHITECTURE.md` when they disagree.
- Keep browser-module style imports (`./file.js`) and avoid adding a build step
  unless the task explicitly requires one.
- Be careful changing WebSocket channel names, auth/session handling, or
  microphone message formats; these are backend contracts.
- If you change mic capture, conversation identity, realtime message transport,
  or service startup behavior, apply the MemoriesDB reading requirements above
  before editing.
