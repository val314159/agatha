# Agatha Frontend

Vite-powered avatar viewer plus the older static browser frontend for the
Agatha/Ava avatar experience and related MemoriesDB account/conversation pages.

The root Vite app is a backend-free avatar viewer that loads the existing VRM
and glTF assets from `html/models`. The older AI/avatar app remains under
`html/a/` and still depends on backend services.

## What Is Here

- `index.html`, `src/`, `vite.config.js` - Vite avatar viewer.
- `html/a/` - older backend-connected 3D avatar app.
- `html/models/` - VRM, GLTF, BIN, and FBX assets used by the avatar app.
- `html/login.html`, `html/register.html`, `html/status.html` - auth/status
  pages that call backend `/auth/*` endpoints.
- `html/convo.html` - conversation dashboard that lists, creates, opens, and
  deletes conversations through a WebSocket helper.
- `html/your_eyes/` - webcam preview/snapshot uploader.
- `html/style.css` - older/shared chat display styling.

## Vite Avatar Viewer

Install dependencies:

```bash
npm install
```

Run the viewer:

```bash
npm run dev
```

Then open the local Vite URL, usually `http://localhost:5173/`.

The viewer has no AI, auth, microphone, WebSocket, or backend requirements. It
loads:

- `/models/avaAvatar.vrm`
- `/models/VRM1_Constraint_Twist_Sample.vrm`
- `/models/cube.gltf`

It can also load a custom URL or local `.vrm`, `.glb`, or `.gltf` file. Vite is
configured with `publicDir: "html"` so the tracked assets in `html/models` are
served at `/models/...`.

Useful commands:

```bash
npm run build
npm run preview
```

With the dev server running, you can also run the browser smoke test:

```bash
npm run smoke
```

The smoke test uses `playwright-core` with the system Chromium binary and writes
verification screenshots under ignored `.tmp/`.

## Legacy Static Pages

The files under `html/` can still be served directly as the web root. The legacy
frontend expects a backend to provide:

- `/auth/login`, `/auth/register`, `/auth/status`, and `/auth/logout`
- `/ws` WebSocket pub/sub
- `/uploads` for webcam snapshots
- `wsapp.js`, `/chat.html`, and `/todo` if using the conversation dashboard or
  embedded surface frame

When `location.hostname === "localhost"`, the avatar app uses:

- `http://localhost:5002` for auth and WebSocket/pub-sub traffic
- `http://localhost:1212` as `BASE_URL1`

On non-localhost hosts, those URLs fall back to `location.origin`.

For legacy static inspection only, you can run:

```bash
python3 -m http.server 8000 --directory html
```

Then open `http://localhost:8000/a/`. The legacy avatar page will load static
assets, but auth, WebSocket, conversation, voice, and upload features need the
backend.

## Legacy Avatar App

Open `/a/`.

Important files:

- `html/a/index.html` - DOM shell, Tailwind/DaisyUI CDN imports, Three.js/VRM
  import map, and dynamic `application.js` load.
- `html/a/application.js` - central coordinator. It extends `PubSubApp`, owns
  runtime state, WebSocket handling, voice capture, PCM playback, lip sync,
  renderer startup, turn state, UI, and message history.
- `html/a/pubSubApp.js` - reconnecting WebSocket client and pub/raw send helper.
- `html/a/voiceRecog.js` and `html/a/aec.js` - microphone capture with AEC
  constraints, Float32-to-Int16 conversion, and raw audio publishing.
- `html/a/audio_player.js` and `html/a/decode_pcm.js` - binary PCM decode and
  Web Audio chunk scheduling.
- `html/a/sceneRenderer.js` - Three.js scene setup, VRM/GLTF loading, FBX
  loading/retargeting, expressions, camera framing, and controls.
- `html/a/animate.js`, `html/a/blinker.js`, `html/a/lipSyncState.js` - render
  loop, idle motion, blinking, eye movement, and mouth animation.
- `html/a/ui.js` - controls, keyboard shortcuts, layout switching, debug feed,
  runtime state strip, model/expression/dance buttons, typed text, and PTT.
- `html/a/turnmachine.js` - push-to-talk turn state machine.
- `html/a/messageHistory.js` - local browser history in
  `localStorage["conversationHistory"]`.
- `html/a/danceFormat.js`, `html/a/danceData.js`, `html/a/DANCE.md` -
  keyframe dance system, sample data, and dance docs.

## Backend/WebSocket Contract

The avatar app connects to `/ws` with output channels:

- `sup-out`
- `aud-out-bin`
- `aud-out-ctl`

It publishes user turns on `sup-in` and voice-recognition raw/control messages on
`vrec-in::`.

The current audio path is binary PCM over WebSocket:

1. Backend sends `audio_pcm` control messages such as `start-audio` and
   `finish-audio`.
2. Binary WebSocket frames are decoded as 16-bit little-endian mono PCM.
3. `AudioPlayer` schedules Float32 chunks with Web Audio.
4. `LipSyncState` drives mouth animation while audio is active.

`Application.incomingMessage()` still contains an older `params.type === "audio"`
branch that calls `generateAudio(params.url)`, but that method is not present in
the current checkout.

## URL Parameters

The avatar app supports:

- `?vrm=ava` or `?vrm=avaAvatar` - load `/models/avaAvatar.vrm`
- `?vrm=blockman` - load `/models/cube.gltf`
- `?vrm=constraint` or `?vrm=twist` - load
  `/models/VRM1_Constraint_Twist_Sample.vrm`
- `?vrm=/path/to/model.vrm` or `?vrm=https://...` - load a custom model path
- `?layout=portrait` or `?layout=landscape`
- `?conversation=<id>` - override the initialized conversation id

## Controls

Common controls in `/a/`:

- Hold the `Hold To Talk` button or `Ctrl+M` to push to talk.
- Click `Convo Mode` to cycle `active`, `idle`, and `sleep`.
- Toggle `barge`/`queue` to control whether PTT interrupts assistant playback.
- Use model buttons to load Agatha/Twist/Block Man.
- Use expression buttons for facial expression tests.
- Use FBX and keyframe dance buttons for animation tests.
- `Alt+P` / `Alt+L` switches portrait/landscape layout.
- `Shift+Left Alt` opens the shortcut modal.
- `Shift+Right Alt` opens the shell modal.

## Other Pages

- `/login.html` and `/register.html` submit `email` and `digest` JSON fields to
  the backend. The included `hashPassword()` helpers are currently unused.
- `/status.html` reads `/auth/status`, shows session fields, and links to chat,
  conversations, and the avatar app.
- `/convo.html` requires a `WsApp` implementation from `wsapp.js`, which is not
  present in this checkout. It appears to be backend-served or from another repo.
- `/your_eyes/` uses webcam `getUserMedia()` and uploads JPEG snapshots to
  `http://localhost:5002/uploads`.

## Documentation Notes

`html/a/ARCHITECTURE.md` and `html/a/classDiagram.html` are useful historical
references, but they are stale in places. Prefer the current source and
`html/a/AGENTS.md` when they disagree.

Known stale or fragile areas include:

- `ui.js` references missing `Application.stopAvatarSpeech()` and
  `Application.enterContinuousMode()` methods for some shortcuts.
- `ui.js` loads `/models/avatar.vrm` for the Agatha button, but the tracked asset
  is `/models/avaAvatar.vrm`.
- `danceFormat.js` and `danceSystem.js` use `window.app`; `index.html` assigns
  the app instance to `window._`.
- `sceneRenderer.js` defines `setupLighting()` twice.
- `messageHistory.js` renders message text through `innerHTML`.
- `convo.html` references local files/routes not included in this checkout.

## Validation

For the Vite viewer:

1. Run `npm run build`.
2. Run `npm run dev` and confirm the viewer loads the default avatar.
3. Test the Twist and Block Man presets.
4. Test camera reset and auto-rotate.

For legacy pages, validate manually in a browser against the backend service:

1. Load `/a/` and confirm the auth gate clears after WebSocket initialization.
2. Confirm the default VRM or selected `?vrm=` asset loads.
3. Test PTT, typed text, conversation mode changes, and binary audio playback.
4. Check browser console output for missing method, missing asset, or WebSocket
   errors.
5. If touching auth/conversation pages, test `/login.html`, `/status.html`, and
   `/convo.html` against the backend.
