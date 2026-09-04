# Voice Recognition: The New World

This document describes the voice system we want to build.

The goal is a voice interaction model that is:

- easy to reason about
- interruptible
- extensible toward true barge-in
- clear about where state and decisions live

## Voice Recognition Mode

The system should have a first-class `voiceRecMode`.

It should be explicit.

It should not be hidden inside a boolean with accidental meaning.

Desired values:

- `off`
- `ptt`
- `continuous`
- `barge_in`

Mode answers:

"What kind of voice interaction policy is active?"

Mode is not the same thing as a runtime flag.

Flags answer:

"What is happening right now?"

Important flags include:

- `isMuted()`
- `isCapturing()`
- `isResolving()`
- `isAsstSpeaking()`

That means `mute` should be a flag, not a mode.

The user should be able to mute and unmute without losing their chosen `voiceRecMode`.

## User Experience

The intended feel is:

- press and talk
- release and it works
- no clipped tail words
- no hot-mic ambiguity
- no overloaded state names

## The Core Principle

There are four distinct things in a voice system:

1. capturing audio
2. recognizing speech
3. releasing transcript
4. interrupting the assistant

These are related, but they are not the same action.

If we keep them separate, the whole system becomes simpler.

If we blur them together, the whole system becomes haunted.

## The Experience We Want

### Push-To-Talk

PTT is the default mode.

The user holds a key or button, speaks, then releases.

Release means:

- stop capturing new audio
- preserve all audio already captured
- finalize recognition for that captured audio
- release the transcript when ready

Release does not mean:

- discard audio
- discard transcript
- instantly force a half-baked transcript out

PTT should feel fast, but never reckless.

### Continuous Mode

Continuous mode is secondary, but still first-class.

It exists for:

- hands-free interaction
- accessibility
- experimentation
- later barge-in work

In continuous mode, the system decides utterance boundaries automatically, using end-of-utterance timing rather than button-up.

### Barge-In

Barge-in is the eventual destination.

That means:

- the assistant is speaking
- the user starts speaking
- the assistant is interrupted gracefully
- user capture and recognition proceed immediately

PTT is the halfway point because it gives us a clean user-intent boundary without needing full duplex chaos on day one.

## The Mental Model

The entire system should be designed around a small state machine, not a pile of callbacks.

At the highest level:

- `idle`
- `capturing`
- `resolving`
- `released`
- `cancelled`

These are turn states, not app-global life states.

`idle` should always mean:

- there is no active turn

That meaning stays stable across modes.

What changes by mode is idle behavior.

Examples:

- in `ptt`, idle means waiting for press
- in `continuous`, idle means no active turn while listening/watchful behavior may still be active
- in `barge_in`, idle means no active turn while the system may still be listening and ready to interrupt assistant output

The assistant audio system has its own state machine.

That is important.

User speech state and assistant playback state should be coordinated, but not collapsed into one blob.

## Turn Identity

A voice `turn_id` should be minted at the first moment the system commits to:

"this is now a real user turn."

That creation moment depends on mode.

### In `ptt`

The turn begins at `capture_start`.

That means:

- button/key goes down
- a new `turn_id` is minted immediately
- capture begins under that `turn_id`

### In `continuous`

The turn begins when the first non-silence audio for that turn is sent.

That means:

- the mic/listener may already be running
- but no turn exists yet
- once the system detects real speech and commits to sending that speech as a turn, it mints `turn_id`

So in continuous mode, "mic active" and "turn active" are not the same thing.

That does not change the meaning of `idle`.

It only changes what the system does while idle.

### In all modes

The `turn_id` should not be invented late:

- not at transcript release
- not when supervisor receives text
- not halfway through the pipeline

It should be created at the true beginning of the turn.

That makes the `turn_id` the unique timestamped identity of when the turn truly began.

This is why a time-ordered UUID is the right shape for voice turns.

The current preferred choice is `uuidv7`.

Once created, that same `turn_id` should follow the turn through:

- capture
- recognition
- transcript buffering
- transcript release
- supervisor routing
- assistant response
- assistant audio

## Resolving

`isResolving` means:

"the turn is now being closed out safely after release intent has been triggered."

In practice that usually means:

- release intent has occurred
- the system is preserving the tail around release
- recognition has been asked to finalize or is in the process of settling
- the system is waiting briefly before committing the turn
- the transcript has not been committed downstream yet

`isResolving` does not claim:

- that capture has already become fully irrelevant at every layer
- that the recognizer is objectively finished in some deep backend sense
- that the turn has already been released

It simply means:

"this turn is being brought from open to resolved."

That is more honest and more useful than pretending we always know when recognition is truly done.

## Pipeline Lanes

The system is easiest to understand as six lanes.

### 1. User Capture

This lane handles microphone capture.

Responsibilities:

- acquire mic
- start capture
- stop capture
- stream PCM chunks
- expose precise capture boundaries

Good event names:

- `capture_start`
- `capture_stop`

This lane knows nothing about transcript release.

In `ptt`, this is also where the `turn_id` is born.

### 2. User VoiceRec

This lane handles speech-to-text recognition.

Responsibilities:

- forward audio to STT
- receive partials/finals
- finalize recognition on demand
- surface recognition completion

Good event names:

- `recognition_partial`
- `recognition_final`
- `recognition_finalize`
- `recognition_done`

This lane knows nothing about assistant playback.

### 3. User Transcript

This lane handles buffered recognized user text and turn release.

Responsibilities:

- accumulate final transcript chunks
- decide when a turn is complete
- release transcript to the rest of the system
- clear transcript only on explicit cancel/reset/error

Good event names:

- `transcript_append`
- `transcript_release`
- `transcript_clear`

### 4. Conversation

This lane is the reasoning layer between user transcript and assistant output.

Responsibilities:

- supervisor routing
- conversation state
- prompt/context assembly
- LLM inference
- response shaping

### 5. Assistant Generation

This lane creates assistant output.

Responsibilities:

- generate assistant text
- decide whether assistant audio should be produced
- prepare assistant output for playback

### 6. Assistant Playback

This lane renders assistant output to the user.

Responsibilities:

- play assistant audio
- stop assistant audio
- coordinate with lip sync and speaking state
- reflect interruption state in the client

## The Golden Rule For PTT

Button-up closes the capture boundary.

It does not destroy the turn.

That means the correct PTT sequence is:

1. `capture_start`
2. stream audio
3. `capture_stop`
4. `recognition_finalize`
5. wait for the final tail to land
6. `transcript_release`

That sequence is the heart of the design.

The `turn_id` is created at step 1 and survives the full sequence.

## Timing Variables

Timing names should describe exactly what they do.

No vague names.

No names that imply disposal when we mean delivery.

### `ptt_release_grace_ms`

This is the tiny grace window after button-up.

Purpose:

- preserve the tail end of speech around release
- catch the last `150-250ms` of intended utterance if button-up and speech end happen almost together
- allow the last audio chunk, transport boundary, and final STT output to settle before the turn is committed

This is the "don't clip the ending" timer.

This is not a generic silence detector.

This is not an abstract segmentation setting.

This is a short post-release window specifically for PTT tail preservation.

Recommended default:

- `150` to `250`

### `continuous_release_delay_ms`

This is the end-of-utterance delay for continuous mode.

Purpose:

- infer when the user has finished speaking in hands-free mode

Recommended starting range:

- `900` to `1400`

### `barge_in_holdoff_ms`

This is optional, but useful later.

Purpose:

- when user speech begins during assistant playback, allow a tiny holdoff to determine whether it is a real interruption before killing assistant audio

This helps avoid accidental barge-in from noise or false starts.

## Variable Names

This section is the naming reference.

The goal is:

- short names
- clear intent
- consistent structure
- mode-specific meaning explained in docs, not hidden in random renames

### Frontend State Variables

These are JavaScript runtime variables, so they should use `camelCase`.

Shared state:

- `voiceRecMode`
- `voiceTurnState`
- `activeTurnId`
- `lastResolvedTurnId`
- `voiceRecMuted`
- `assistantPlaybackState`

Meaning:

- `voiceRecMode`
  - current interaction policy
- `voiceTurnState`
  - current user voice-turn state
- `activeTurnId`
  - current live user turn, if any
- `lastResolvedTurnId`
  - previous resolved turn, for bookkeeping/logging only
- `voiceRecMuted`
  - backing mute flag for user voice recognition
- `assistantPlaybackState`
  - current assistant playback state

Derived query methods:

- `isMuted()`
- `isIdle()`
- `isCapturing()`
- `isResolving()`
- `isAsstSpeaking()`

These should be explicit functions, not duplicated writable booleans.

### Frontend Timing Variables

These are also JavaScript runtime variables, so they should use `camelCase`.

Shared timing:

- `pttReleaseDelayMs`
- `continuousReleaseDelayMs`
- `turnResolveTimeoutMs`

Optional future timing:

- `bargeInInterruptHoldoffMs`
- `bargeInReleaseDelayMs`

Meaning by mode:

- `pttReleaseDelayMs`
  - in `ptt`, this protects the tail end of speech after button-up
- `continuousReleaseDelayMs`
  - in `continuous`, this is the delay before the system decides the utterance is done and releases the turn
- `turnResolveTimeoutMs`
  - maximum time to wait before forcing resolution of the current turn
- `bargeInInterruptHoldoffMs`
  - delay before interrupting assistant speech in barge-in mode
- `bargeInReleaseDelayMs`
  - delay before releasing a user turn in barge-in mode, if barge-in needs its own release policy

### Wire / Control Message Fields

If these values travel over JSON to the backend, use `snake_case`.

Examples:

- `turn_id`
- `voice_rec_mode`
- `ptt_release_delay_ms`
- `continuous_release_delay_ms`
- `turn_resolve_timeout_ms`
- `barge_in_interrupt_holdoff_ms`

### Naming By Intent

If you are naming a new variable, first decide which category it belongs to.

Turn identity:

- `activeTurnId`
- `lastResolvedTurnId`

Mode / policy:

- `voiceRecMode`

Runtime flags:

- `voiceRecMuted`
- `assistantPlaybackState`

Derived state queries:

- `isMuted()`
- `isIdle()`
- `isCapturing()`
- `isResolving()`
- `isAsstSpeaking()`

Timing knobs:

- `pttReleaseDelayMs`
- `continuousReleaseDelayMs`
- `turnResolveTimeoutMs`

Future barge-in timing:

- `bargeInInterruptHoldoffMs`
- `bargeInReleaseDelayMs`

### Naming By Mode

Shared across all modes:

- `voiceRecMode`
- `voiceTurnState`
- `activeTurnId`
- `voiceRecMuted`
- `assistantPlaybackState`

Mostly relevant to `ptt`:

- `pttReleaseDelayMs`

Mostly relevant to `continuous`:

- `continuousReleaseDelayMs`

Mostly relevant to `barge_in`:

- `bargeInInterruptHoldoffMs`
- `bargeInReleaseDelayMs`

## The Vocabulary We Want

These words should become the canonical language of the voice system.

Use these:

- `capture`
- `finalize`
- `release`
- `clear`
- `interrupt`
- `grace`
- `delay`

Avoid these unless they are truly exact:

- `stop`
- `start`
- `flush`
- `silence`
- `segmentation`

Why:

- `stop` is overloaded
- `flush` sounds like disposal to many humans
- `silence` sounds like VAD even when we only mean delayed release
- `segmentation` is too abstract for the real job being done

## Desired Event Contract

If we were naming the control contract from scratch, it would look like this:

- `capture_start`
- `capture_stop`
- `speech_start`
- `speech_stop`
- `recognition_finalize`
- `transcript_release`
- `transcript_clear`
- `set_ptt_release_grace_ms`
- `set_continuous_release_delay_ms`
- `assistant_interrupt`

That contract is readable even without comments.

That is the standard.

The point of the control stream is not to replace the audio stream.

The point is to let the server know exactly what the client state machine thinks is happening.

So the architecture is:

- audio stream
  - raw audio streamed continuously while capture is active
- control stream
  - JSON messages inserted alongside audio to communicate state transitions and policy hints

The client streams audio.

The client also sends explicit control messages so the server does not have to guess at state transitions from raw audio alone.

## Desired Frontend Shape

The frontend should have one voice subsystem, not a graveyard of experiments.

The clean frontend architecture is:

- `Application`
  - orchestrates mode, transport, and assistant coordination
- `VoiceCapture`
  - microphone lifecycle and PCM streaming
- `VoiceTurnController`
  - turn state machine, timing, and release policy
- `VoiceUI`
  - PTT button, keyboard shortcut, indicators

Optional:

- `AssistantSpeechController`
  - playback, interruption, lip-sync coordination

The key idea is that the browser should not need to know every detail of transcript buffering internals. It should know intent and boundaries.

At the frontend state level, the shape should be:

- `voiceRecMode`
  - `off | ptt | continuous | barge_in`
- `isMuted`
- `isCapturing`
- `isResolving`
- `isAsstSpeaking`
- `activeTurnId`

`activeTurnId` is created at the true beginning of the turn:

- `capture_start` in `ptt`
- first non-silence audio sent for the turn in `continuous`

## Desired Backend Shape

The backend should mirror the same separation.

Ideal components:

- `CaptureSession`
  - one session's inbound audio transport
- `RecognitionSession`
  - STT engine connection and recognition lifecycle
- `TranscriptBuffer`
  - final chunk accumulation and release policy
- `TurnPublisher`
  - publishes completed user turns to supervisor

This is cleaner than one class handling everything from queueing to naming to release timing to transcript publication.

## Desired PTT Behavior In Detail

This is the gold-standard PTT feel we are after:

### Press

- mic becomes live
- input indicator changes immediately
- assistant may continue speaking for a moment unless interruption policy says otherwise
- a new `turn_id` is minted immediately

### Speak

- PCM streams continuously
- STT can produce partials for debugging or future UI, but user turn is not released yet

### Release

- mic capture stops immediately
- already-captured audio is preserved
- recognizer is asked to finalize
- the turn enters resolving state
- `ptt_release_grace_ms` begins

### Final tail

- the system protects the tail end of speech around button-up
- any late-arriving final transcript chunks are accepted
- transcript buffer remains intact

### Release transcript

- merged user utterance is published exactly once
- transcript buffer is then cleared because release succeeded
- the turn leaves resolving state

This should feel sharp and forgiving at the same time.

That combination is the whole trick.

## Desired Continuous Behavior In Detail

Continuous mode should feel natural, not twitchy.

The flow:

1. mic/listener may stay live while no turn exists
2. first non-silence audio for a real utterance causes `turn_id` to be minted
3. recognizer emits finals as speech settles
4. transcript buffer accumulates
5. `continuous_release_delay_ms` determines utterance boundary
6. transcript is released

Continuous mode should share the same transcript lane as PTT.

Only the boundary policy changes.

## Desired Barge-In Behavior

When we get to barge-in, the rule is:

user intent outranks assistant output

That means if the user begins a genuine interruption:

- assistant audio stops
- assistant speech state flips immediately
- user capture continues
- recognition finalizes normally
- transcript releases normally

But we do not want frantic self-interruption from noise, breaths, or accidental mic bumps.

So the barge-in trigger should require confidence:

- PTT press
- or sustained speech energy
- or recognizer confidence strong enough to count as intent

## What Makes This Architecture Attractive

People get jealous of systems that feel inevitable.

This one should feel inevitable.

Why it is desirable:

- every verb maps to one responsibility
- PTT is crisp without being brittle
- continuous mode is natural without being magical
- barge-in becomes an extension, not a rewrite
- debugging becomes possible because state is explicit
- timing knobs have human names
- the user can trust what happens when they press, speak, and release

## Non-Goals

This design does not aim to:

- maximize cleverness
- hide state transitions
- make every mode share identical timing
- let one overloaded event do five jobs
- preserve legacy naming for nostalgia

## Build Order

The ideal implementation order is:

1. clean PTT semantics
2. clean naming contract
3. transcript lane separation
4. continuous mode on the same model
5. assistant interruption lane
6. true barge-in

## The Standard

If a future contributor opens this system cold, they should be able to answer:

- What is the current `voiceRecMode`?
- What starts capture?
- What stops capture?
- When is the `turn_id` created?
- What does `isResolving` actually mean?
- What is `ptt_release_grace_ms` protecting?
- What finalizes recognition?
- What releases transcript?
- What clears transcript?
- What interrupts the assistant?
- Which timer is for PTT grace?
- Which timer is for continuous utterance end?

And they should be able to answer all of that without guessing.

That is the bar.

That is the new world.
