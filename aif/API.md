# API Documentation

This document describes the public HTTP routes served by [hub.py](/home/val/src/memoriesdb/m4/services/hub.py), the websocket protocol used by browser clients and internal agents, and the message contracts currently implemented by the `llm6` and `dbs6` agents.

## Overview

The app has two transport layers:

- HTTP for auth, session bootstrap, and static files
- WebSocket for real-time application traffic

The main websocket hub fans messages out by channel. Browser clients normally subscribe to:

- `llm6-out`
- `dbs6-out`

Internal agents connect with the internal secret and subscribe to their own input channels:

- `llm6.py` subscribes to `llm6-in`
- `dbs6.py` subscribes to `dbs6-in`

## HTTP API

### `GET /`

Redirects to `/chat.html`.

Response:

- `302 Found`

### `GET /auth/status`

Returns auth/session state based on the `session` cookie. Also echoes the `device_id` cookie if present.

Success response:

```json
{
  "logged_in": true,
  "user_id": "af56e800-4cf7-4085-b55a-56cf3ae96652",
  "email": "user@example.com",
  "conversation_id": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
  "device_id": "7d0cc0f85b49f0e4f0d8183f0c0d6e5f"
}
```

Logged-out response:

```json
{
  "logged_in": false
}
```

### `POST /auth/login`

Authenticates a user by email and password digest.

Request body:

```json
{
  "email": "user@example.com",
  "digest": "sha-or-md5-style-client-digest"
}
```

Success response:

```json
{
  "status": "ok",
  "user_id": "af56e800-4cf7-4085-b55a-56cf3ae96652",
  "session_id": "b51ad6f6-4f5d-4d81-a8c1-7d3d3f6e14ec",
  "session_token": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc"
}
```

Failure response:

```json
{
  "status": "error",
  "error": "Invalid email or password"
}
```

Behavior:

- Sets `device_id` cookie if missing
- Sets `session` cookie on success
- Both cookies are `HttpOnly` and `SameSite=lax`
- legacy alias `POST /login` still exists in the server for compatibility

### `POST /auth/register`

Registers a new user.

Request body:

```json
{
  "email": "user@example.com",
  "digest": "sha-or-md5-style-client-digest",
  "no_create_user": false
}
```

Typical success response:

```json
{
  "status": "ok",
  "user_id": "af56e800-4cf7-4085-b55a-56cf3ae96652"
}
```

Notes:

- if `no_create_user` is omitted or `false`, the server also bootstraps an initial conversation for the new user
- legacy alias `POST /register` still exists in the server for compatibility

### `POST /auth/logout`

Logs out the current session.

Success response:

```json
{
  "status": "ok"
}
```

Behavior:

- deletes the server-side session row if a session cookie is present
- deletes the `session` cookie from the response
- legacy aliases `GET /logout` and `POST /logout` still exist in the server for compatibility

### `GET /<path>`

Serves static files from the directory specified by `ROOT` in [hub.py](/home/val/src/memoriesdb/m4/services/hub.py). In the current Procfile this is `public`.

Notes:

- directory requests redirect to a trailing-slash path
- `Cache-Control` is set to `no-store, must-revalidate`

## WebSocket API

### Endpoint

`GET /ws`

The websocket uses channel subscriptions in the query string:

```text
ws://localhost:5002/ws?c=llm6-out&c=dbs6-out
```

Browser clients authenticate using the `session` cookie.

Internal agents authenticate using:

```text
X-Internal-Secret: <secret>
```

If the websocket session is invalid, the hub closes the socket with:

- close code `1008`
- close reason `auth_failed`

### Session behavior

On a successful browser connection, the hub:

1. validates the `session` cookie
2. finds or bootstraps the user’s latest conversation
3. subscribes the socket to the requested channels
4. sends an `initialize` message

### Message framing

The hub accepts either of these publish patterns:

1. two-frame publish
2. one JSON frame containing `params.channel`

The browser code in [wsapp.js](/home/val/src/memoriesdb/m4/public/wsapp.js) currently sends the two-frame pattern:

Frame 1:

```text
llm6-in
```

Frame 2:

```json
{
  "method": "pub",
  "params": {
    "channel": "llm6-in",
    "role": "user",
    "content": "hello",
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe",
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "stream": true
  }
}
```

### `initialize` message

Sent by the hub immediately after a successful websocket connection.

Example:

```json
{
  "method": "initialize",
  "params": {
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "wsid": "0x79136ad568c0",
    "channels": [
      "llm6-out",
      "dbs6-out"
    ],
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc"
  }
}
```

Field meanings:

- `uuid`: authenticated user ID
- `conversation`: latest conversation ID for the user, or `null`
- `wsid`: server-side websocket object ID string
- `channels`: channels subscribed by this socket
- `session_id`: current session token

### Generic `pub` message

All agent traffic is wrapped as:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-in",
    "role": "user",
    "content": "listConvos",
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "turn_id": "88ec91d4-c36f-42ee-9542-69642269f18c",
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "stream": true
  }
}
```

Common fields:

- `channel`: destination input channel such as `llm6-in` or `dbs6-in`
- `role`: usually `user` or `system`
- `content`: command name for `dbs6`, prompt text for `llm6`
- `uuid`: user ID
- `conversation`: active conversation ID
- `turn_id`: ID grouping one chat round or request
- `session_id`: used by the hub to route session-scoped responses
- `stream`: whether streaming behavior is desired

### Session-scoped output channels

Agents normally reply on:

- `llm6-out::<session_id>`
- `dbs6-out::<session_id>`

The hub strips the `::<session_id>` suffix and only forwards the message to sockets whose session token matches.

## Agent Contracts

## `dbs6`

Implemented in [dbs6.py](/home/val/src/memoriesdb/m4/services/dbs6.py).

Purpose:

- conversation metadata queries
- short history reads
- conversation creation/deletion
- explicit history writes for non-`llm6` clients

### `dbs6` request envelope

All `dbs6` commands use:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-in",
    "role": "user",
    "content": "<command>",
    "uuid": "<user_id>",
    "conversation": "<conversation_id>",
    "turn_id": "<turn_id>",
    "session_id": "<session_token>",
    "stream": true
  }
}
```

Notes:

- the current browser helper includes `stream: true` on `dbs6` requests
- `dbs6.py` does not currently use `stream` to change behavior

### `dbs6` response envelope

Success:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-out::<session_id>",
    "content": "<command>",
    "results": [],
    "turn_id": "<turn_id>"
  }
}
```

Failure:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-out::<session_id>",
    "content": "<command>",
    "error": "human-readable error",
    "results": [],
    "turn_id": "<turn_id>"
  }
}
```

### `dbs6` commands

#### `listConvos`

Request:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-in",
    "role": "user",
    "content": "listConvos",
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "turn_id": "88ec91d4-c36f-42ee-9542-69642269f18c",
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "stream": true
  }
}
```

Response:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-out::eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "content": "listConvos",
    "results": [
      [
        "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
        "NewSession2026-03-14T20:55:22"
      ]
    ],
    "turn_id": "88ec91d4-c36f-42ee-9542-69642269f18c"
  }
}
```

#### `shortHistory`

Returns simplified history rows for the active conversation.

Request:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-in",
    "role": "user",
    "content": "shortHistory",
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "turn_id": "00ae98f3-ed37-4ffe-b4a5-33e2fbca2d8b",
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "stream": true
  }
}
```

Response:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-out::eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "content": "shortHistory",
    "results": [
      {
        "role": "assistant",
        "content": "thanks, I will keep those things in mind!"
      },
      {
        "role": "user",
        "content": "my favorite color is purple. also, I love to eat french fries."
      },
      {
        "role": "system",
        "content": "you love to add numbers using tools"
      }
    ],
    "turn_id": "00ae98f3-ed37-4ffe-b4a5-33e2fbca2d8b"
  }
}
```

#### `newConvo`

Creates a new conversation from the configured template file.

Request:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-in",
    "role": "user",
    "content": "newConvo",
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "turn_id": "4efebd87-98f3-462d-b04b-d83cff72b50d",
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "stream": true
  }
}
```

Response:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-out::<session_id>",
    "content": "newConvo",
    "results": [
      "2f1d5f28-2132-11f1-a1b0-3f88da5474a8"
    ],
    "turn_id": "4efebd87-98f3-462d-b04b-d83cff72b50d"
  }
}
```

#### `delConvo`

Soft deletes a conversation and its messages.

Request:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-in",
    "role": "user",
    "content": "delConvo",
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "conversation_id": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "turn_id": "0f1abf8d-c617-4873-892a-497641995431",
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "stream": true
  }
}
```

Success response:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-out::<session_id>",
    "content": "delConvo",
    "results": [
      "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8"
    ],
    "turn_id": "0f1abf8d-c617-4873-892a-497641995431"
  }
}
```

#### `saveConvoRound`

Persists one or more history messages to an existing conversation without using `llm6`.

Request with `messages`:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-in",
    "role": "user",
    "content": "saveConvoRound",
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "conversation_id": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe",
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "stream": true,
    "messages": [
      {
        "role": "user",
        "content": "what's my favorite color?",
        "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe"
      },
      {
        "role": "assistant",
        "content": "Your favorite color is purple.",
        "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe",
        "done": true
      }
    ]
  }
}
```

Equivalent request with a single `message`:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-in",
    "role": "user",
    "content": "saveConvoRound",
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe",
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "stream": true,
    "message": {
      "role": "assistant",
      "content": "Your favorite color is purple.",
      "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe",
      "done": true
    }
  }
}
```

Success response:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-out::<session_id>",
    "content": "saveConvoRound",
    "results": [
      "c3e6e4e2-3eb1-4d3f-a8bf-0671a764e90b",
      "4b0bc2d0-e5f1-47d0-a7cc-d3f5dbbd164d"
    ],
    "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe"
  }
}
```

## `llm6`

Implemented in [llm6.py](/home/val/src/memoriesdb/m4/services/llm6.py).

Purpose:

- execute a chat round against the current model
- stream assistant output back to the browser
- persist the turn through [conversation.py](/home/val/src/memoriesdb/m4/lib/conversation.py)

### `llm6` request

Request:

```json
{
  "method": "pub",
  "params": {
    "channel": "llm6-in",
    "role": "user",
    "content": "what's my favorite color?",
    "uuid": "af56e800-4cf7-4085-b55a-56cf3ae96652",
    "conversation": "1e4f164a-1fe8-11f1-a1b0-3f88da5474a8",
    "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe",
    "session_id": "eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "stream": true
  }
}
```

Notes:

- `content` is the user prompt text
- `role` is usually `user`
- `conversation` identifies which prior history the model should load
- `turn_id` groups all events generated by that round
- `stream` is meaningful for `llm6` and controls whether the browser receives chunked output

### `llm6` responses

`llm6` responses are streamed as multiple `pub` messages on `llm6-out::<session_id>`.

Typical sequence:

1. optional echoed user message
2. assistant chunk(s)
3. optional tool-call-related messages
4. final assistant completion with `done: true`

Chunk example:

```json
{
  "method": "pub",
  "params": {
    "channel": "llm6-out::eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "role": "assistant",
    "content": "Your favorite color is ",
    "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe"
  }
}
```

Final message example:

```json
{
  "method": "pub",
  "params": {
    "channel": "llm6-out::eGHI_WfAlhaUZC6lpIGt1bqDYN7F8Pd-mZOHAsHX5rc",
    "role": "assistant",
    "content": "",
    "done": true,
    "turn_id": "79cf8445-5f6d-4b39-bef8-f319aa33babe"
  }
}
```

Possible assistant-side fields:

- `role`
- `content`
- `thinking`
- `done`
- `tool_calls`
- `tool_name`
- `images`
- `turn_id`

## End-to-end examples

### Page bootstrap

1. browser requests `/chat.html`
2. browser calls `/auth/status`
3. browser opens `/ws?c=llm6-out&c=dbs6-out`
4. hub sends `initialize`
5. browser sends `shortHistory` to `dbs6-in`
6. `dbs6` returns simplified history on `dbs6-out::<session_id>`

### One chat turn

1. browser sends prompt to `llm6-in`
2. `llm6` loads prior history by conversation ID inside `lib/conversation.py`
3. `llm6` streams assistant output back on `llm6-out::<session_id>`
4. `lib/conversation.py` persists only the new turn’s records

## Notes and caveats

- The websocket protocol is channel-based, not RPC-based.
- `turn_id` is generated client-side in the default browser app and propagated through the backend.
- `dbs6` uses `content` as a command name, not as freeform text.
- `dbs6` currently ignores `stream`; it is present because the shared browser helper sends it on all websocket publishes.
- `llm6` uses `content` as the user prompt text.
- Session token strings are used directly as websocket session IDs in current code.
- `dbs6` responses should be checked by looking for `params.error`; otherwise use `params.results`.

