# Agent Notes

The repo also contains `html/a/AGENTS.md`, which has detailed notes for the
avatar app and should be read before changing files under `html/a/`.

## Repository Shape

- This repo now has a root Vite app for backend-free avatar viewing.
- Use `npm run dev` for the Vite app, `npm run build` for production build
  validation, `npm run preview` for a local production preview, and
  `npm run smoke` for browser/canvas smoke checks against a running dev server.
- Vite uses `publicDir: "html"` so existing files under `html/` are served as
  static assets, including `/models/...`.
- Serve `html/` directly only when testing the legacy static pages.
- Keep browser code as plain ES modules with relative imports such as
  `./application.js`.
- Browser libraries for the avatar app are loaded by the import map in
  `html/a/index.html`. Avoid adding a build step unless explicitly requested.

## Important Areas

- Vite viewer: `index.html`, `src/main.js`, `src/styles.css`,
  `vite.config.js`.
- Legacy backend-connected app: `html/a/index.html` and
  `html/a/application.js`.
- WebSocket client: `html/a/pubSubApp.js`.
- Turn handling: `html/a/turnmachine.js`.
- Microphone capture: `html/a/voiceRecog.js` and `html/a/aec.js`.
- Streaming PCM playback: `html/a/audio_player.js` and `html/a/decode_pcm.js`.
- Three.js/VRM rendering: `html/a/sceneRenderer.js` and `html/a/animate.js`.
- UI wiring: `html/a/ui.js`.
- Local message history: `html/a/messageHistory.js`.
- Auth pages: `html/login.html`, `html/register.html`, `html/status.html`.
- Conversation dashboard: `html/convo.html`.
- Webcam snapshot tool: `html/your_eyes/`.

## Backend Contracts

The root Vite viewer has no backend contract. For legacy pages, treat these as
external contracts:

- Auth endpoints: `/auth/login`, `/auth/register`, `/auth/status`,
  `/auth/logout`.
- WebSocket endpoint: `/ws`.
- Avatar app channels: `sup-in`, `sup-out`, `aud-out-bin`, `aud-out-ctl`,
  `vrec-in::`.
- Upload endpoint used by `your_eyes`: `/uploads`.

On localhost, `Application` points auth/WebSocket traffic at
`http://localhost:5002` and `BASE_URL1` at `http://localhost:1212`. On other
hosts it uses `location.origin`.

Do not rename channels, change voice-recognition control payloads, or change
conversation/session identity fields without checking the matching backend.

## MemoriesDB Guidance

The existing `html/a/AGENTS.md` says this frontend depends on a sibling
MemoriesDB checkout at `../memoriesdb`. If a task touches memory storage,
conversation identity, realtime messages, WebSocket hub behavior, browser cookie
auth, internal-agent auth, or service startup/readiness, first read the relevant
docs in that sibling repo when present:

- `../memoriesdb/docs/ai-quickstart.md`
- `../memoriesdb/docs/db-library.md`
- `../memoriesdb/docs/hub-protocol.md`
- `../memoriesdb/docs/python-agents.md`
- `../memoriesdb/docs/auth-and-cookies.md`
- `../memoriesdb/docs/process-readiness.md`

Use stable MemoriesDB surfaces only. Do not import from internal
`memoriesdb.lib.*` or `memoriesdb.services.*` modules from this repo.

## Current Source Of Truth

Prefer current source over older docs. `html/a/ARCHITECTURE.md` and
`html/a/classDiagram.html` still describe removed modules such as
`TextToSpeech`, `Voice`, `VoiceMgr`, and `VoiceRec`.

The current voice path is:

1. `voiceRecog.js` captures microphone audio with `getUserMedia()`.
2. It converts Float32 mic frames to Int16 and sends raw frames on `vrec-in::`.
3. Backend audio returns as `audio_pcm` control messages plus binary PCM frames.
4. `decode_pcm.js` converts PCM to Float32.
5. `audio_player.js` schedules chunks with Web Audio.
6. `LipSyncState` and `animate.js` drive mouth animation.

## Known Gotchas

- `Application.incomingMessage()` calls missing `generateAudio()` for legacy
  `params.type === "audio"` messages. The working path appears to be
  `audio_pcm` plus binary frames.
- `ui.js` calls missing `Application.stopAvatarSpeech()` and
  `Application.enterContinuousMode()` for `Ctrl+.` and `Ctrl+,`.
- The Agatha model button in `ui.js` points to `/models/avatar.vrm`, but the
  tracked model is `/models/avaAvatar.vrm`.
- `danceFormat.js` and `danceSystem.js` toggle idle animation via `window.app`,
  while `html/a/index.html` assigns the app instance to `window._`.
- `sceneRenderer.js` defines `setupLighting()` twice.
- `MessageHistory.updateDisplay()` assumes `#history-list` exists and
  `messageHistory.add()` renders message text with `innerHTML`.
- `html/convo.html` depends on `wsapp.js` and links to `/chat.html`; neither file
  is tracked here.
- `html/your_eyes/your_eyes.js` uses an implicit global `PREFIX` and hardcodes
  `http://localhost:5002` for uploads.
- `login.html` contains default credential values, and login/register currently
  send the password string as `digest`; the hash helper is unused.

## Edit Guidance

- Keep changes scoped. This repo is small, but the browser/backend contracts are
  broad.
- Preserve existing static-file paths unless you also update every caller.
- Do not move large model/audio assets unless the task is explicitly about asset
  layout.
- When adding UI controls, wire all expected states and missing-element guards in
  `ui.js`.
- When editing avatar rendering, test at least the default VRM and `?vrm=blockman`
  if the change touches model loading, animation, or expressions.
- When editing microphone or audio playback code, test with a real backend and
  watch WebSocket frames/browser console output.
- Be careful with untrusted text. Prefer `textContent` over `innerHTML` for new
  message rendering.

## Manual Validation Checklist

There is no automated test suite. After changes, manually check what the change
touches:

- For Vite viewer changes, run `npm run build`.
- Start `npm run dev` and check the default, Twist, and Block Man presets.
- `/a/` loads without module import errors.
- The auth gate clears after backend WebSocket `initialize`.
- Default `?vrm=ava`, `?vrm=blockman`, and relevant custom model paths load.
- PTT starts/stops capture and updates runtime state.
- Typed text publishes a user turn.
- Binary PCM playback starts, drains, and ends lip sync.
- Auth pages can login/logout/register against the backend.
- Conversation dashboard works only when `wsapp.js` is available.
- Webcam snapshot tool works only on localhost/HTTPS with camera permission.
