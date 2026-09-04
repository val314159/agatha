# Ava Avatar Frontend Architecture

This document describes the architecture of the **Ava the Avatar** frontend. It is intended to serve both as:

- A **conceptual overview** of the major layers and how they work together.
- A **practical reference** for each module and class (inputs, outputs, important fields), so you can treat this like an API manual for the frontend.

The primary design goal of this app is to make a **remote, server-driven voice + LLM agent** feel **local and embodied** via:

- A VRM/GLTF 3D avatar with expressive animation.
- Precise lip-synchronization to both **server-generated voice audio** and local browser TTS.
- Rich keyboard, text, and voice input (wakewords, push-to-talk, shortcuts).

Server voice is the **primary voice** for LLM responses; local voice is a **local interaction artifact** for quick feedback (wake/sleep acknowledgements, etc.).

---

## 1. High-Level Architecture Overview

### 1.1 Major Layers

From top to bottom:

1. **UI & Layout Layer**  
   - `index.html`, `style.css`, and `UI` class (`ui.js`).  
   - Defines the layout, controls, and visible components (history, avatar, controls, modals), plus keyboard focus and shortcuts.

2. **Orchestration Layer**  
   - `Application` (`application.js`) and `PubSubApp` (`pubSubApp.js`).  
   - Central coordinator for sub-systems. Connects to server via WebSocket, manages audio queue, sleep/listening state, and orchestrates initialization.

3. **Rendering & Animation Layer**  
   - `SceneRenderer` (`sceneRenderer.js`), `animate.js`, `Blinker` (`blinker.js`), `LipSyncState` (`lipSyncState.js`).  
   - Owns the Three.js scene, avatar loading, Mixamo animation retargeting, lip sync animation, and subtle idle movement.

4. **Audio & Voice Layer**  
   - **Server audio path**: handled in `Application` using WebSocket messages and an audio queue.  
   - **Local voice path**: `TextToSpeech` (`textToSpeech.js`), `Voice` (`voice.js`), `VoiceMgr` (`voiceMgr.js`).  
   - Coordinates speaking text, updating history, and feeding lip-sync state.

5. **Input Layer (Keyboard, Text, Speech)**  
   - `UI` keyboard handlers, TTS and history textareas.  
   - `VoiceRec` (`voiceRec.js`) for speech recognition and wakewords.  
   - Push-to-talk gating via `Application.listening`.

6. **Conversation & Persistence Layer**  
   - `MessageHistory` (`messageHistory.js`) and `localStorage` persistence.  
   - Keeps a scrollable, timestamped history across page reloads.

7. **Networking / Backend Boundary Layer**  
   - `PubSubApp` for WebSocket lifecycle; `Application.incomingMessage` as the adapter to frontend state.  
   - Simple pub/sub-like message format with channels and types.

Support modules:

- `UrlParams` (`urlParams.js`) for URL-based configuration.  
- `ShellModal` (`shellModal.js`) for debugging / shell popup.  
- `classDiagram.html` as an out-of-band Mermaid diagram.

### 1.2 Typical Runtime Flows

#### 1.2.1 Startup

1. `index.html` loads styles, import map, and `Application` as an ES module.  
2. `window._ = new Application()` runs the `Application` constructor:
   - Sets base URLs, initializes sub-systems (voice, lip sync, renderer placeholder, UI, message history, etc.).
   - Connects WebSocket via `PubSubApp.connect()`.
   - Binds `document.body.onload` to `app.init()`.
3. `init()` runs on `body.onload`:
   - Creates `SceneRenderer` attached to `#avatar-container`.
   - Initializes `UI`, `VoiceMgr`, `ShellModal`, `MessageHistory`, `VoiceRec`.
   - Loads initial avatar model based on URL params (`UrlParams.getInitialAvatarModelPath()`).
   - Applies URL parameters for layout/pitch/rate/voice.  
   - Starts continuous speech recognition (`VoiceRec.init()`) and the global animation loop (`animate(app)`).

#### 1.2.2 User speaks (voice input)

1. Browser speech recognition (`VoiceRec`) receives interim results; when a result is final it passes the transcript to `VoiceRec.processVoiceInput()`.
2. If transcript matches **local wakeword commands**:
   - E.g. "ava wake up now", "ava go to sleep now", etc.  
   - `VoiceRec` calls corresponding methods on `Application` (`wakeup()`, `gotosleep()`, `setListening(false/true)`, or reload).
3. Otherwise:
   - `VoiceRec` calls `Application.talkToAva(transcript)`.
   - `talkToAva()` checks `asleep` and `listening` flags. If `asleep` or `!listening`, message is dropped.  
   - If allowed, it sends a pub message via WebSocket to the server with `{ role: 'user', content: transcript, generate_audio: true }`.

Push-to-talk (PTT) modifies only `app.listening`, not the recognizer itself:

- `Ctrl + M` sets `listening = true` (gate open).  
- Releasing `M` sets `listening = false` (gate closed).  
- Speech recognition continues running, but only transcripts that arrive while `listening` is true are forwarded to the server.

#### 1.2.3 Server responds with audio

1. Server sends a WebSocket message such as:

   ```json
   { "method": "pub", "params": { "type": "audio", "url": "/some/audio/path" } }
   ```

2. `PubSubApp` receives it and calls `Application.incomingMessage(msg)`.
3. `incomingMessage` inspects `params.type`:
   - For `type === 'audio'`, it calls `generateAudio(params.url)`.
4. `generateAudio()` either enqueues or directly starts audio playback:
   - Ultimately calls `startAudioPlayback(audioUrl)`, which:
     - Calls `cleanupAudio(true)` to stop any existing audio and end lip sync.  
     - Builds a new `Audio` object using `BASE_URL1 + audioUrl`.  
     - Stores it as `app.audioElement`.  
     - Calls `lipSync.onstart()` to mark speech as active.  
     - Registers an `ended` handler to call `lipSync.onend()` and clear `audioElement`.  
     - Calls `animateAvatar(lipSync)` to ensure proper onend behavior.  
     - Starts playback, and on completion (or error) processes the next queued audio item.
5. The global animation loop (`animateLipSync`) reads `LipSyncState` (`active`, `startTime`, `endTime`) to compute `mouthValue` and applies it to the jaw bone and blend shapes, keeping the lip motion in sync with real audio time.

#### 1.2.4 Local TTS (non-server)

Used for things like wake/sleep responses and explicit local phrases:

1. Code calls `TextToSpeech.speak(text, isUserInput)` or `Application.speak(text)` / `Application.wakeup()` / `gotosleep()`.
2. `TextToSpeech.speak()`:
   - If `LipSyncState.active` is already true, it **does not speak again** (avoid double audios).  
   - Adds the text to `MessageHistory`, marking `isUserInput` appropriately.  
   - Uses its `Voice` instance to call `window.speechSynthesis.speak(utterance)`, with callbacks wired to `LipSyncState.onstart/onend/onerror` for lip sync.

Currently, the `Voice` instance does **not** yet fully adopt `VoiceMgr`’s voice / pitch / rate settings, but the structure is in place for doing so.

---

## 2. Layered Architecture & Separation

This section describes each layer, its responsibilities, and how distinct it is from other layers.

### 2.1 UI & Layout Layer

**Files:**

- `index.html`
- `style.css`
- `ui.js` (class `UI`)

**Responsibilities:**

- Define all visible DOM elements: history panel, avatar container, controls, modals.  
- Manage Tailwind/DaisyUI styling and custom layout CSS for portrait/landscape modes.  
- Provide user interaction wiring: button clicks, keyboard shortcuts, focus movement, layout changes.

**Distinctness / Coupling:**

- Mostly clean: UI logic is concentrated in `UI` and HTML.  
- `UI` depends on `Application` for high-level actions (e.g., load model, speak, send message).  
- Some duplication with `VoiceMgr` in handling the TTS input `#tts-input` (both attach Enter handlers).  
- Uses DOM IDs extensively; rename of IDs requires coordinated changes in `UI` and `style.css`.

### 2.2 Orchestration Layer

**Files:**

- `application.js` (`Application` extends `PubSubApp`)
- `pubSubApp.js` (`PubSubApp`)

**Responsibilities:**

- Coordinate initialization and interaction between all sub-systems.  
- Maintain global state: `currentVRM`, `avatarBones`, lip sync state, audio queue, listening/sleep flags.  
- Bridge WebSocket messages to the rest of the frontend.  
- Provide a single entry point (`new Application()`) that sets up the app.

**Distinctness / Coupling:**

- `Application` is intentionally the hub and is coupled to almost every other module.  
- `PubSubApp` is cleanly separated as a reusable WebSocket client with no avatar-specific logic.  
- Audio and TTS responsibilities are somewhat split between `Application` and `TextToSpeech` (server vs local paths).

### 2.3 Rendering & Animation Layer

**Files:**

- `sceneRenderer.js` (`SceneRenderer`)
- `animate.js` (`animate`, `animateIdleStates`, `animateLipSync`)
- `blinker.js` (`Blinker`)
- `lipSyncState.js` (`LipSyncState`)

**Responsibilities:**

- Configure the Three.js scene, camera, renderer, controls, and lights.  
- Load VRM/GLTF avatar models and attach them to the scene.  
- Load and retarget Mixamo FBX animations onto VRM using a rig map.  
- Maintain per-frame updates: idle motion, blinking, lip-sync, animation mixer stepping.  
- Adjust camera framing to keep the avatar in view.

**Distinctness / Coupling:**

- Strong internal cohesion: animation and VRM concerns sit together.  
- Depends on `Application` for VRM references and lip sync state, but the interfaces are relatively narrow (`currentVRM`, `lipSync`, `idleAnimationState`).  
- `animateIdleStates` contains some inline complexity and slightly tricky control flow, but conceptually still part of the rendering layer.

### 2.4 Audio & Voice Layer

**Files:**

- Server audio path: `application.js` (audio queue + playback).  
- Local voice path: `textToSpeech.js` (`TextToSpeech`), `voice.js` (`Voice`), `voiceMgr.js` (`VoiceMgr`).

**Responsibilities:**

- **Server voice:** receive audio URLs from WebSocket, queue them, play them, and drive lip sync.  
- **Local voice:** speak arbitrary text using browser TTS for local interactions, also driving lip sync.  
- Voice selection, pitch, and rate selection (currently used by UI and persisted to URL, but not fully plumbed into `Voice`).

**Distinctness / Coupling:**

- Conceptually two paths (server vs local); the lip sync abstraction (`LipSyncState`) helps unify them.  
- Some open work in tying `VoiceMgr` settings into `Voice` (currently decoupled).  
- Server audio path is tightly coupled to `Application` and WebSocket events; local path is more modular.

### 2.5 Input Layer (Keyboard, Text, Speech)

**Files:**

- `ui.js` (keyboard & text inputs).  
- `voiceRec.js` (`VoiceRec`) for speech recognition and wakewords.

**Responsibilities:**

- Map keyboard interactions to UI actions (layout, expressions, dances, model loads).  
- Control push-to-talk gating (`Application.listening`).  
- Route text inputs to either local TTS or server-based LLM via `talkToAva()`.  
- Convert speech recognition results (wakewords vs general utterances) into local or server actions.

**Distinctness / Coupling:**

- Most input handling is centralized in `UI` and `VoiceRec`, which is good separation.  
- `VoiceRec` is bound to browser capabilities (SpeechRecognition); `UI` is bound to DOM, but both talk to `Application` only through relatively simple, high-level methods.

### 2.6 Conversation & Persistence Layer

**Files:**

- `messageHistory.js` (`MessageHistory`).

**Responsibilities:**

- Keep a bounded list of messages with metadata (`text`, `isUser`, `timestamp`).  
- Render this list into the DOM (`#history-list`).  
- Persist/restore the list from `localStorage` as `conversationHistory`.

**Distinctness / Coupling:**

- Very well isolated: logic is focused on list management and DOM rendering.  
- Other modules only need to call `add(text, isUser)` or `clear()`, not manage DOM details.

### 2.7 Networking / Backend Boundary Layer

**Files:**

- `pubSubApp.js` (`PubSubApp`).  
- `application.js` (implements `incomingMessage`).

**Responsibilities:**

- Provide a generic, reconnecting WebSocket client: URL building, ping loop, exponential backoff reconnect.  
- Encapsulate message sending through `pub()` — hides JSON and channel details.  
- Handle incoming messages and map them to audio playback or logging.

**Distinctness / Coupling:**

- `PubSubApp` is cleanly abstracted and reusable.  
- Application-specific message interpretation lives in `Application.incomingMessage`, correctly keeping model-agnostic concerns (reconnect, ping, etc.) separate.

---

## 3. Detailed Module & API Reference

This section is meant as a reference manual for the frontend. For each module/class, it explains how to use it, important fields, and expected inputs/outputs.

### 3.1 index.html

**Purpose:** Define the DOM skeleton and bootstrap `Application`.

**Key IDs / Elements:**

- `#main-container` – flex container for history, avatar, and controls.  
- `#history-container` – scrollable conversation history overlay (background).  
- `#history-list` – `<ul>` where `MessageHistory` renders messages.  
- `#text-input` – textarea for text input that goes to server (`Application.talkToAva`).  
- `#avatar-container` – container that holds Three.js canvas.  
- `.controls-container` – right/bottom panel with all UI controls.  
- Buttons: `#say-hello`, `#tell-more`, `#sayTestPhraseBtn`, `#load-ava`, `#load-constraint`, `#load-blockman`, dance buttons (`#dance-*`), `#stop-dance`, etc.  
- Voice controls: `#tts-input`, `#speak-button`, `#voice-select`, `#pitch-slider`, `#rate-slider`, `#pitch-value`, `#rate-value`.  
- Modals: `#shortcut-modal`, `#shell-modal`.  
- Safari audio workaround: `#arm-button` and `<audio id="audio">`.

**Bootstrap:**

```js
import { Application } from './application.js';
window._ = new Application();
```

The intent is that normal usage is through this HTML; you don’t generally instantiate `Application` yourself elsewhere.

### 3.2 style.css

**Purpose:** Provide layout and layering rules for portrait vs landscape, and style the history.

**Key classes:**

- `.layout-portrait` and `.layout-landscape` applied to `body`.  
- `#main-container` flex direction depends on layout.  
- `#history-container` is absolute and full-screen to act as a background glass pane.  
- `#avatar-container` is layered above history, with `pointer-events: none` so history can remain interactive (Three.js canvas overrides this).  
- `.controls-container` styled as bottom strip (portrait) or right sidebar (landscape).  
- `.history-item.user` and `.history-item.avatar` for colored message bubbles.

**Usage:**

You don’t typically call into CSS; instead, `UI.setLayout('portrait'|'landscape')` drives which layout is active.

### 3.3 Application (application.js)

**Class:** `Application extends PubSubApp`

**Construction:**

```js
const app = new Application();
// Usually invoked once from index.html and assigned to window._
```

**Important instance fields:**

- `BASE_URL0`, `BASE_URL1`, `BASE_URL` – set based on `location.hostname === 'localhost'`; used for WebSocket / audio URLs.  
- `IN_CH`, `OUT_CH` – pub/sub channel names (`'sup-in'` and `'sup-out'`).  
- `audioElement` – currently playing `HTMLAudioElement` for server audio.  
- `audioQueue` – array of pending audio URLs to play.  
- `queueAudioPlayback` – boolean; if true, new audio is queued instead of played immediately.  
- `lipSync` – instance of `LipSyncState`.  
- `sceneRenderer` – instance of `SceneRenderer` created in `init()`.  
- `messageHistory` – instance of `MessageHistory`.  
- `blinker` – instance of `Blinker`.  
- `voiceMgr` – instance of `VoiceMgr`.  
- `voiceRec` – instance of `VoiceRec`.  
- `textToSpeech` – instance of `TextToSpeech`.  
- `shellModal` – instance of `ShellModal`.  
- `ui` – instance of `UI`.  
- `currentVRM` – current VRM avatar (set by `SceneRenderer.loadVRMModel`).  
- `avatarBones` – map of discovered bones used by idle animation.  
- `clock` – `THREE.Clock` created by `animate()` for delta time.  
- `listening` – boolean gate for sending user messages to server.  
- `asleep` – boolean gate for wake/sleep semantics.  
- `sleepreqs` – integer count of repeated sleep requests.

**Key methods (public-facing):**

- `constructor()`  
  - Initializes sub-systems and WebSocket connection.  
  - Binds `document.body.onload = this.init.bind(this)`.

- `init()`  
  - Called when `body` loads.  
  - Creates `SceneRenderer`, initializes UI and voice manager, loads avatar and history, starts `VoiceRec` and animation.

- `incomingMessage(msg)`  
  - Implementation of abstract `PubSubApp.incomingMessage`.  
  - Expects `msg` with shape like `{ method, params }`.  
  - For `method === 'pub'` and `params.type === 'audio'`, calls `generateAudio(params.url)`.  
  - Other types currently log and may be extended.

- `generateAudio(audioUrl)`  
  - If `queueAudioPlayback` is true, enqueues `audioUrl` and triggers `processAudioQueue()`.  
  - Otherwise, calls `startAudioPlayback(audioUrl)`.

- `startAudioPlayback(audioUrl)`  
  - Stops any current audio (`cleanupAudio(true)`).  
  - If `audioUrl` is falsy, calls `animateAvatar()` and returns.  
  - Creates a new `Audio(BASE_URL1 + audioUrl)` and stores it in `this.audioElement`.  
  - Calls `lipSync.onstart()` to mark speaking.  
  - Registers an `ended` handler that calls `lipSync.onend()`, clears `audioElement`, and continues the queue.  
  - Calls `animateAvatar(lipSync)` to set up event-driven end-of-speech behavior.  
  - Starts playback and logs errors if any.

- `cleanupAudio(shouldEndLipSync = false)`  
  - If an `audioElement` exists, removes any `ended` handler, pauses it, and resets `currentTime` to 0.  
  - Optionally calls `lipSync.onend()` to terminate lip sync state.  
  - Sets `audioElement` to `null`.

- `processAudioQueue()`  
  - If `audioElement` is already playing or the queue is empty, does nothing.  
  - Otherwise, shifts the next URL and calls `startAudioPlayback(next)`.

- `setListening(state: boolean)`  
  - Sets `this.listening`.  
  - `talkToAva` uses this to decide whether to send messages to server.

- `talkToAva(message: string)`  
  - No-op if `asleep` is true or `listening` is false.  
  - Otherwise calls `this.pub({ role: 'user', content: message, generate_audio: true })`.  
  - `pub` is inherited from `PubSubApp` and sends via WebSocket.

- `wakeup()`  
  - Chooses a text message depending on `asleep` flag.  
  - Uses `TextToSpeech.speak(text, true)` and also calls `this.speak(text)`.  
  - Resets `asleep = false` and `sleepreqs = 0`.

- `gotosleep()`  
  - Uses `TextToSpeech.speak()` to say a sleep-related phrase.  
  - Updates `asleep` and `sleepreqs` accordingly.

- `speak(text: string)`  
  - Delegates to `TextToSpeech.speak(text, true)`.

- `speakPhrase(text: string)`  
  - Convenience wrapper for `this.textToSpeech.speak(text)`.

- `applyUrlParameters()`  
  - Reads `layout`, `pitch`, `rate`, and `voice` query params via `UrlParams`.  
  - Applies them via `UI.setLayout` and `VoiceMgr.setPitchFromString`, `.setRateFromString`, `.setVoiceFromString`.

**Usage notes:**

- In normal usage, you don’t call most of these methods from outside; `UI` and `VoiceRec` call them on your behalf.  
- For debugging or scripting from the browser console, you can use `window._`:
  - `_.setListening(true)` / `_.setListening(false)`.  
  - `_.talkToAva('hello from console')`.  
  - `_.wakeup()` / `_.gotosleep()`.

### 3.4 PubSubApp (pubSubApp.js)

**Class:** `PubSubApp`

**Purpose:** Abstract WebSocket connection with reconnect and ping logic, used as a base class for `Application`.

**Important instance fields:**

- `BASE_URL` – base URL for WebSocket; `Application` overrides this.  
- `IN_CH`, `OUT_CH` – logical channel names for pub/sub.  
- `ws` – underlying `WebSocket` instance.  
- `reconnectAttempts` – number of failed attempt cycles.  
- `reconnectTimeoutId` – timeout handle for scheduled reconnect.  
- `pingIntervalId` – interval handle for periodic pings.

**Key methods:**

- `incomingMessage(_msg)`  
  - Abstract; must be implemented by subclass (like `Application`).

- `getWsUrl(): string`  
  - Builds WebSocket URL from `BASE_URL` and `OUT_CH`: `BASE_URL + '/ws?c=' + OUT_CH + '&c=qaz&c=backdoor&wsx'`.

- `send(msg: object)`  
  - If `ws` is open, sends `JSON.stringify(msg)`.  
  - Otherwise logs a warning.

- `pub(params: object, channel: string = this.IN_CH)`  
  - Wraps params into `{ method: 'pub', params: { channel, ...params } }` and sends.

- `startPingLoop()` / `stopPingLoop()`  
  - Start/stop a 15-second interval that sends a `ping` message via `pub({ timestamp: Date.now() }, 'ping')` when WebSocket is open.

- `scheduleReconnect()` / `clearReconnectTimer()`  
  - On disconnect or error, schedule reconnect with exponential backoff (up to 30s).  
  - `clearReconnectTimer` cancels any pending reconnect.

- `connect()`  
  - Stops existing ping loop.  
  - Constructs `wsUrl` via `getWsUrl`.  
  - Creates `WebSocket` object and assigns handlers:
    - `onopen` – starts ping loop, resets attempts, clears reconnect timer.  
    - `onclose` / `onerror` – stop ping loop, schedule reconnect.  
    - `onmessage` – parses JSON and passes to `this.incomingMessage(parsed)`.

- `disconnect()`  
  - Stops ping loop, clears reconnect timer, and closes WebSocket if present.

**Usage:**

- You subclass `PubSubApp` and implement `incomingMessage`.  
- For one-off use, `Application` already does this; you don’t normally interact with `PubSubApp` directly.

### 3.5 UI (ui.js)

**Class:** `UI`

**Construction:**

```js
const ui = new UI(app);
ui.init();
```

**Constructor parameters:**

- `app` – the `Application` instance. `UI` keeps a reference to call actions like `sceneRenderer.loadVRMModel`, `textToSpeech.speak`, `talkToAva`, etc.

**Important instance fields:**

- `app` – `Application`.  
- `layoutSelect` – DOM `<select id="layout-select">`.  
- `container` – `#avatar-container`.  
- `ttsInput` – `#tts-input`.  
- `textInput` – `#text-input`.  
- `pitchValueLabel` – `#pitch-value` span.  
- `rateValueLabel` – `#rate-value` span.

**Key methods:**

- `init()`  
  - Queries essential DOM elements.  
  - Logs an error if core elements are missing.  
  - Calls `installEventListeners()`.

- `installEventListeners()`  
  - Attaches click handlers to dance buttons, model load buttons, phrase buttons.  
  - Binds TTS input and speak button: Enter or button click calls `TextToSpeech.speak(text, true)`.  
  - Binds history input: Enter sends `talkToAva(text)`.  
  - Binds clear history button.  
  - Binds expression buttons to `SceneRenderer.setExpression` and adds to history.  
  - Implements global keyboard behavior:
    - `Esc` → remove focus.  
    - `Shift+Alt+LeftShift` → show shortcut modal.  
    - `Shift+Alt+RightShift` → show shell modal.  
    - `Alt+
` or `Alt+O` → clear history.  
    - `Alt+P/L` → set layout to portrait/landscape.  
    - `Ctrl+M` → enable push-to-talk (set `listening = true`); keyup `m` → disable.  
    - `Alt` combinations to trigger expressions, model loads, dances, phrase buttons.  
    - `Alt+V/B/N` → focus voice select / pitch slider / rate slider.  
    - `ArrowLeft/ArrowRight` → focus traversal across controls.  
    - Direct typing when not in an input → focus the TTS input.
  - Attaches window resize listener to adjust camera aspect and renderer size when container size changes.

- `setLayout(layout: 'portrait' | 'landscape')`  
  - Adds/removes `.layout-portrait` / `.layout-landscape` on `document.body`.  
  - Dispatches a `resize` event after a short delay (100ms) to recalibrate Three.js.

- `removeFocus()`  
  - Blurs the current active element if possible.  
  - Calls `window.focus()` afterwards.

- `updatePitchValueLabel(value: number | string)` / `updateRateValueLabel(value: number | string)`  
  - Format to two decimals and update the associated spans.

**Usage:**

- Created and owned by `Application`.  
- External callers should not construct this directly unless they are building another orchestration layer.

### 3.6 SceneRenderer (sceneRenderer.js)

**Class:** `SceneRenderer`

**Constructor:**

```js
const renderer = new SceneRenderer(containerElement);
```

**Constructor parameters:**

- `containerElement` – DOM element (e.g., `#avatar-container`) where the Three.js canvas will be appended.

**Important instance fields:**

- `scene` – Three.js `Scene`.  
- `camera` – `PerspectiveCamera`.  
- `renderer` – `WebGLRenderer`.  
- `controls` – `OrbitControls`.  
- `timeScale` – numeric multiplier for animation speed.  
- `currentMixer` – `AnimationMixer` for active FBX animation.  
- `currentAnimationUrl` – currently loaded FBX animation URL.  
- `idleAnimationState` – structured object controlling idle motion (breathing, weight shift, arms, fingers, head).  
- `vrmLoader` – `GLTFLoader` configured with `VRMLoaderPlugin`.

**Key methods:**

- `update()`  
  - Updates `OrbitControls` and renders the scene with the camera.

- `add(object)` / `remove(object)`  
  - Add/remove an object (e.g., VRM model) to/from the scene.

- `frameCamera(object)`  
  - Computes the bounding box of `object`.  
  - Resets near/far planes based on size.  
  - Positions camera at a reasonable distance and looks at the center.

- `loadVRMModel(app, modelPath: string)`  
  - Removes existing VRM from scene and unloads any animation.  
  - Loads VRM/GLTF from `modelPath`.  
  - Sets `app.currentVRM` to the loaded VRM.  
  - Adds VRM scene to Three.js scene.  
  - Extracts `mouthExpressionKey` and `mouthWidenKey` using heuristic matching (supports VRM 1.0 or 0.x APIs).  
  - Searches for a jaw bone named `J_Bip_C_Head` and assigns it to `app.lipSync.jawBone`.  
  - Calls `frameCamera(vrm.scene)`.

- `unloadFBX()`  
  - Stops and clears the current `AnimationMixer`.  
  - Resets `currentAnimationUrl` and re-enables idle animations.

- `loadFBX(animationUrl: string, appInstance: Application)`  
  - Requires `appInstance.currentVRM` to be present.  
  - Disables idle animations for the duration of the FBX animation.  
  - Creates a new `AnimationMixer` on `currentVRM.scene`.  
  - Uses `loadMixamoAnimation(animationUrl, currentVRM)` to get a converted `AnimationClip`.  
  - Plays the clip with `LoopOnce`, then replays on `finished` events, with `timeScale` applied.

- `loadMixamoAnimation(url: string, vrm)`  
  - Returns a `Promise<AnimationClip>`.  
  - Loads FBX data using `FBXLoader`.  
  - Finds `AnimationClip` named `mixamo.com`.  
  - Retargets tracks from Mixamo bone names to VRM bone names using `SceneRenderer.mixamoVRMRigMap`.  
  - Applies hips height scaling so motion size matches VRM.  
  - Returns a VRM-compatible `AnimationClip`.

- `setExpression(vrm, expr: 'happy'|'angry'|'sad'|'relaxed'|'surprised'|'neutral')`  
  - Resets all expression weights.  
  - Uses `expressionMap` to map the high-level expression name to candidate keys.  
  - For VRM 1.0 (expressionManager) or VRM 0.x (blendShapeProxy), finds a matching key and sets its weight to 1.

**Usage:**

- `Application.init()` constructs `SceneRenderer` and stores it as `app.sceneRenderer`.  
- `UI` calls `sceneRenderer.loadVRMModel(app, path)` and `sceneRenderer.loadFBX(url, app)` in button handlers.  
- The animation loop in `animate.js` calls `app.sceneRenderer.update()` each frame.

### 3.7 animate.js

**Exports:**

- `animateIdleStates(app)`  
- `animateLipSync(app)`  
- `animate(app)`

**Expected `app` shape:**

- `app.currentVRM` – VRM instance with scene and optional `update` method.  
- `app.sceneRenderer` – instance of `SceneRenderer` with `renderer`, `scene`, `camera`, `currentMixer`, `idleAnimationState`.  
- `app.blinker` – `Blinker`.  
- `app.lipSync` – `LipSyncState`.  
- `app.avatarBones` – map of relevant bones (initialized lazily).  
- `app.clock` – `THREE.Clock` (created on first `animate(app)` call).

**Behavior:**

- `animateIdleStates(app)`  
  - Uses `THREE.Clock` time to modulate breathing, weight shift, arm sway, head movement, and leg sway.  
  - If `app.avatarBones` is not yet populated, traverses `app.currentVRM.scene` to find bones with matching name patterns.  
  - Uses `idleAnimationState` parameters (phase, frequency, amplitude) to compute smooth motion.

- `animateLipSync(app)`  
  - Reads `app.lipSync.active`, `startTime`, `endTime`, and `fadeOutDuration`.  
  - Computes `mouthValue` between 0 and 1 based on elapsed time and a sinusoidal function.  
  - Applies `mouthValue` to `lipSync.jawBone.rotation.x` (if present).  
  - Sets appropriate expression weights on VRM expressions or blend shapes using `mouthExpressionKey` and `mouthWidenKey`.

- `animate(app)`  
  - If `app.clock` does not exist, creates it.  
  - Uses `requestAnimationFrame` to schedule the next frame.  
  - Calls `app.sceneRenderer.update()`.  
  - Updates `currentMixer` (if any) by delta time.  
  - If `currentVRM` is present, calls `animateLipSync(app)` and `animateIdleStates(app)`.  
  - If VRM has `update` method, calls `currentVRM.update(1/60, { renderer, scene, camera })`.  
  - Finally renders scene via `app.sceneRenderer.renderer.render(scene, camera)`.

**Usage:**

- Called once from `Application.init()` as `animate(this)`.  
- You generally do not call these manually.

### 3.8 Blinker (blinker.js)

**Class:** `Blinker`

**Purpose:** Realistic, randomized eye blink behavior.

**Important fields:**

- `isBlinking` – whether a blink is in progress.  
- `blinkStartTime`, `blinkDuration`.  
- `nextBlinkTime` – time of next blink (randomized).  
- `isDoubleBlinking` – whether current blink is part of a double blink.  
- `secondBlinkDelay` – delay between first and second blink in a double blink.

**Key methods:**

- `update(now: number, currentVRM)`  
  - `now` is typically `performance.now()`; `currentVRM` is the active VRM.  
  - If `now >= nextBlinkTime` and not already blinking, starts a blink and possibly marks it as a double blink.  
  - Computes a smooth close/open value over the blink duration, with randomized strength.  
  - If double blinking, triggers a second blink after `secondBlinkDelay`.  
  - On completion, schedules `nextBlinkTime` and sets `isBlinking = false`.  
  - Calls `applyBlinkToVRM(currentVRM, blinkValue)` each frame.

- `applyBlinkToVRM(currentVRM, blinkValue)`  
  - For VRM 1.0: uses `expressionManager`/`expressions` to set eye-related expressions.  
  - For VRM 0.x: uses `blendShapeProxy` to set common blink blend shapes.

**Usage:**

- Owned by `Application` as `blinker`.  
- Called from `animateIdleStates(app)` every frame.

### 3.9 LipSyncState (lipSyncState.js)

**Class:** `LipSyncState`

**Purpose:** Track whether speech is active and provide hooks to keep lip sync consistent for both server and local voice.

**Important fields:**

- `active` – whether speech is currently in progress.  
- `startTime` – timestamp at speech start.  
- `endTime` – timestamp when speech ended.  
- `fadeOutDuration` – ms to fade out lip motion after speech ends (default 50).  
- `mouthExpressionKey`, `mouthWidenKey` – keys used by VRM expressions / blend shapes for mouth.  
- `jawBone` – reference to a jaw bone if available.

**Key methods:**

- `onstart()`  
  - Marks `active = true` and sets `startTime = performance.now()`.

- `onend()`  
  - Marks `active = false` and sets `endTime = performance.now()`.

- `onerror(event)`  
  - Marks `active = false`, updates `endTime`, and logs the error.

- `startSpeaking(text, voice, pitch, rate)`  
  - Alternative path that creates a `SpeechSynthesisUtterance` directly.  
  - Sets `utterance.voice`, `pitch`, `rate`.  
  - Hooks `onstart`, `onend`, and `onerror` to update state.  
  - Calls `window.speechSynthesis.speak(utterance)`.  
  - **Note:** In current code, this is not the primary path; instead, `TextToSpeech` uses `Voice` with explicit callbacks bound to `onstart/onend/onerror`.

**Usage:**

- `Application` and `SceneRenderer` treat `LipSyncState` as a source of truth for when mouth should move.  
- `TextToSpeech` and server audio playback both call `lss.onstart/onend/onerror` via callbacks on utterances/audio elements.

### 3.10 TextToSpeech (textToSpeech.js)

**Class:** `TextToSpeech`

**Constructor:**

```js
const tts = new TextToSpeech(voiceMgr, lipSyncState, messageHistory);
```

**Constructor parameters:**

- `voiceMgr` – instance of `VoiceMgr`.  
- `lipSyncState` – instance of `LipSyncState`.  
- `messageHistory` – instance of `MessageHistory`.

**Important fields:**

- `voiceMgr`, `lipSyncState`, `messageHistory`.  
- `voice` – instance of `Voice`.

**Key methods:**

- `speak(text: string, isUserInput: boolean = false)`  
  - If `!text`, returns.  
  - If `lipSyncState.active` is true, logs and returns (avoid overlapping speech).  
  - Adds the text to history via `messageHistory.add(text, isUserInput)`.  
  - Reads pitch/rate from `voiceMgr` (currently not applied to `voice` object).  
  - Calls `voice.speak(text, { onStart, onEnd, onError })`, wiring callbacks to `lipSyncState.onstart/onend/onerror`.

**Usage:**

- `Application` holds one `textToSpeech` instance and calls `textToSpeech.speak()` to produce local speech.  
- `UI` and `VoiceMgr` ultimately route TTS input through this method.

### 3.11 Voice (voice.js)

**Class:** `Voice`

**Purpose:** Lightweight wrapper around browser `speechSynthesis` that triggers callbacks for lip sync.

**Constructor:**

```js
const v = new Voice({ name, language, pitch, rate, volume });
```

**Fields:**

- `name`, `language`, `pitch`, `rate`, `volume`, optionally `voice` (actual `SpeechSynthesisVoice`).

**Key methods:**

- `speak(text: string, { onStart, onEnd, onError } = {})`  
  - If `!text`, returns.  
  - Creates `SpeechSynthesisUtterance(text)`, sets `lang`, `pitch`, `rate`, `volume`.  
  - If `this.voice` is set, assigns it to `utterance.voice`.  
  - Hooks `onstart`, `onend`, and `onerror` to log and call provided callbacks.  
  - Calls `window.speechSynthesis.speak(utterance)`.

**Usage:**

- Not typically used directly; `TextToSpeech` owns one `Voice` and manages its callbacks.

### 3.12 VoiceMgr (voiceMgr.js)

**Class:** `VoiceMgr`

**Purpose:** Manage browser voices and slider values; integrate with URL parameters for pitch, rate, and voice selection.

**Constructor:**

```js
const mgr = new VoiceMgr();
mgr.init(app);
```

**Important fields:**

- `voices` – array of `SpeechSynthesisVoice`.  
- `voiceSelect` – `<select id="voice-select">`.  
- `pitchSlider` – `<input id="pitch-slider">`.  
- `rateSlider` – `<input id="rate-slider">`.  
- `ttsInput` – `#tts-input`.  
- `app` – `Application` reference.

**Key methods:**

- `init(app)`  
  - Stores `app`.  
  - Binds DOM elements.  
  - Adds `keydown` handler on TTS input: Enter without Shift → sends text to history and calls `app.speakPhrase(text)` (local TTS).  
  - Calls `populateVoices()`; re-populates when `speechSynthesis.onvoiceschanged` fires and re-applies voice URL param via `setVoiceFromString`.  
  - Binds `change` events on voice select, pitch slider, and rate slider to update URL params and log values.

- `populateVoices()`  
  - Calls `window.speechSynthesis.getVoices()`.  
  - Clears and fills `voiceSelect` options with names and languages, marking default/local voices.  
  - Picks a "best" default voice (natural/neural/Google/Apple/Microsoft `en-*`, or fallback `en-*`).

- `getSelectedVoice()`  
  - Returns the currently selected `SpeechSynthesisVoice`.

- `getVoiceByIndex(index)` / `getVoiceByName(name)`  
  - Convenience lookup.

- `setVoiceFromString(voiceParam: string)`  
  - If `voiceParam` is numeric, treats it as an index.  
  - Otherwise searches by name substring (case-insensitive).  
  - If voices aren’t loaded yet, retries after a delay.

- `setPitchFromString(pitchParam: string)`  
  - Parses and clamps to `[0.5, 2]`.  
  - Sets `pitchSlider.value` and calls `app.ui.updatePitchValueLabel(...)`.

- `setRateFromString(rateParam: string)`  
  - Same as pitch, but for `rateSlider` and `updateRateValueLabel`.

**Usage:**

- Owned by `Application` and initialized in `init()`.  
- Externally, you can call `app.voiceMgr.setVoiceFromString('Google')` or similar to pick voices programmatically.

### 3.13 VoiceRec (voiceRec.js)

**Class:** `VoiceRec`

**Purpose:** Wrap browser speech recognition and map transcripts to wakewords vs. server-bound utterances.

**Constructor:**

```js
const vr = new VoiceRec(avatarApp, callback?);
```

**Fields:**

- `recognition` – the `SpeechRecognition`/`webkitSpeechRecognition` instance.  
- `isVoiceActive` – whether recognition should be active (start/stop).  
- `callback` – currently unused optional callback.  
- `app` / `avatar` – reference to `Application`.

**Key methods:**

- `init()`  
  - Checks for `SpeechRecognition` support; alerts if missing.  
  - Creates `recognition` object and configures:
    - `continuous = true`, `interimResults = true`, `lang = 'en-US'`.  
  - `onstart` logs when recognition starts.  
  - `onresult` processes final results: pass transcript to `processVoiceInput()`.  
  - `onerror` logs and disables recognition on non-`no-speech` errors.  
  - `onend` restarts recognition automatically if `isVoiceActive` is still true.  
  - Calls `toggleVoiceRecognition(this.isVoiceActive)` at the end to start listening.

- `processVoiceInput(transcript: string)`  
  - Logs the transcript.  
  - If it contains wakeword phrases:
    - "va reload the page now" → `location.reload(true)` after 2s.  
    - "va stop listening now" → `avatar.setListening(false)`.  
    - "va start listening now" → `avatar.setListening(true)`.  
    - "va wake up now" → `avatar.wakeup()`.  
    - "va go to sleep now" → `avatar.gotosleep()`.  
  - Otherwise, calls `avatar.talkToAva(transcript)`.

- `toggleVoiceRecognition(activate: boolean)`  
  - Sets `isVoiceActive = activate`.  
  - If `activate` is true, tries to start `recognition`, with retry on failure.  
  - If `activate` is false, stops recognition.

**Usage:**

- `Application` constructs `voiceRec = new VoiceRec(this)` and calls `voiceRec.init()` in `init()`.  
- PTT gating uses `setListening()` rather than toggling recognition itself; you could extend it to call `voiceRec.toggleVoiceRecognition` if you want mic-level control.

### 3.14 MessageHistory (messageHistory.js)

**Class:** `MessageHistory`

**Purpose:** Store and render conversation history, persisted across sessions.

**Fields:**

- `history` – array of `{ text, isUser, timestamp }`.  
- `maxMessages` – maximum length (100).

**Key methods:**

- `clear()`  
  - Clears `history`, updates display, saves to `localStorage`.

- `load()`  
  - Reads `conversationHistory` from `localStorage`.  
  - If present, parses JSON into `history` and updates display.

- `save()`  
  - Stores `history` as JSON in `localStorage`.

- `add(text: string, isUser: boolean)`  
  - Pushes a new message into `history` with current local time as `timestamp`.  
  - Ensures the list does not exceed `maxMessages`, dropping the oldest.  
  - Updates the display and saves.

- `updateDisplay()`  
  - Grabs `#history-list` from DOM.  
  - Clears its contents and re-renders all messages as `<li>` nodes with `.history-item.user` or `.history-item.avatar`.  
  - Scrolls `historyList` to the bottom.

**Usage:**

- `Application` constructs `messageHistory` and `TextToSpeech` calls `messageHistory.add()` when speaking.  
- `UI` and `SceneRenderer` can also add narrative entries (e.g., "*starts dancing*", expression tags).

### 3.15 UrlParams (urlParams.js)

**Object:** `UrlParams`

**Methods:**

- `getInitialAvatarModelPath(): string`  
  - Reads `vrm` query param and maps it to:
    - `'ava'` / `'avaavatar'` → `/models/avaAvatar.vrm`.  
    - `'blockman'` → `/models/cube.gltf`.  
    - Contains `'constraint'` or `'twist'` → `/models/VRM1_Constraint_Twist_Sample.vrm`.  
    - If starts with `/` or `http`, treated as literal path.  
    - Otherwise logs and falls back to `/models/avaAvatar.vrm`.

- `getQueryParam(name: string): string | null`  
  - Convenience wrapper around `URLSearchParams`.

- `updateUrlParam(name: string, value: string)`  
  - Updates query param in current URL using `history.pushState` (no reload).

**Usage:**

- Used by `Application.applyUrlParameters()` and `VoiceMgr` to keep UI and URL in sync.

### 3.16 ShellModal (shellModal.js)

**Class:** `ShellModal`

**Purpose:** Manage the shell `dialog` element.

**Fields:**

- `modalElement` – DOM element `#shell-modal`.

**Key methods:**

- `init()`  
  - Finds `#shell-modal` and logs an error if not present.

- `show()`  
  - Calls `modalElement.showModal()` if available.

- `hide()`  
  - Calls `modalElement.close()` if available.

**Usage:**

- `Application` constructs `shellModal` and calls `shellModal.init()` in `init()`.  
- `UI` shows it on `Shift+Alt+RightShift` key combo.

### 3.17 classDiagram.html

**Purpose:** Out-of-band Mermaid diagram showing class relationships.  
**Note:** Not referenced at runtime; useful for visual reference only.

---

## 4. Layer Separation Summary & Observations

### 4.1 Layer Distinctness

- **UI & Layout:**  
  - Clear separation of concerns; main dependency is `Application`.  
  - Some minor duplication (TTS Enter handler in both `UI` and `VoiceMgr`).

- **Orchestration:**  
  - `Application` intentionally central and coupled to all layers.  
  - `PubSubApp` is nicely abstracted and reusable.

- **Rendering & Animation:**  
  - Cohesive and well-encapsulated; primarily depends on VRM and Three.js.  
  - Lip sync and blinking modules are clean and generic.

- **Audio & Voice:**  
  - Conceptually two paths; unified by `LipSyncState`.  
  - Opportunity to more tightly integrate `VoiceMgr` with `Voice` to honor pitch/rate/voice.

- **Input:**  
  - Keyboard and speech handling are centralized (`UI`, `VoiceRec`), which is good.  
  - PTT currently gates server sends, not microphone activation; this is a deliberate design but can be extended.

- **Conversation & Persistence:**  
  - Very distinct and decoupled aside from DOM ID usage.

- **Networking:**  
  - `PubSubApp` is a clean base; `Application.incomingMessage` is the only place aware of avatar-specific message semantics.

### 4.2 Potential Refinements (Non-breaking)

These are observations, not required changes:

- Consolidate TTS input handling in one place (`UI` or `VoiceMgr`) to avoid ambiguity.  
- Apply `VoiceMgr` configuration to `Voice` (pitch/rate/selected voice) to match UI expectations.  
- Factor richer WebSocket message handling into a dedicated adapter module if payload types grow.  
- Slightly refactor `animateIdleStates` to make control flow and braces clearer for future edits.

This `ARCHITECTURE.md` should now serve both as a conceptual map and a detailed API reference you can use while iterating on the Ava avatar frontend.
