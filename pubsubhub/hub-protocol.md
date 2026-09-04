# Hub Protocol

The hub is the WebSocket message bus used by browser clients, service workers,
and agent processes.

Python agents can use `memoriesdb.agent`; see
[python-agents.md](python-agents.md).

Default URL:

```text
ws://localhost:5002/ws
```

Subscribe to channels with query parameters:

```text
ws://localhost:5002/ws?c=dbs6-out&c=llm6-out
```

## Authentication

Browser clients authenticate with the `session` cookie.

Internal services and trusted local tools authenticate with:

```text
X-Internal-Secret: <INTERNAL_SECRET>
```

If `INTERNAL_SECRET` is not set, the development default is:

```text
dev-secret
```

Unauthenticated WebSocket clients are closed with policy violation code `1008`
and reason `auth_failed`.

See [auth-and-cookies.md](auth-and-cookies.md) for login endpoints, cookies,
and browser-vs-agent auth guidance.

## Initialize Message

After a successful connection, the hub sends:

```json
{
  "method": "initialize",
  "params": {
    "uuid": "user uuid or system uuid",
    "channels": ["dbs6-out"],
    "session_id": "browser session token or null"
  }
}
```

Internal-secret connections use the system user:

```text
00000000-0000-0000-0000-000000000000
```

## Publish Message

The canonical publish payload is:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-in",
    "content": "listConvos",
    "uuid": "00000000-0000-0000-0000-000000000000",
    "turn_id": "request uuid"
  }
}
```

The `channel` field inside `params` determines the target channel.

## Send Patterns

The hub accepts either a single JSON frame:

```python
ws.send(json.dumps({
    "method": "pub",
    "params": {
        "channel": "dbs6-in",
        "content": "listConvos",
        "uuid": user_id,
        "turn_id": turn_id
    }
}))
```

or a two-frame publish:

```python
ws.send("dbs6-in")
ws.send(json.dumps({
    "method": "pub",
    "params": {
        "channel": "dbs6-in",
        "content": "listConvos",
        "uuid": user_id,
        "turn_id": turn_id
    }
}))
```

Existing service helpers use the two-frame form.

## Channel Conventions

```text
dbs6-in    DB service input
dbs6-out   DB service output
llm6-in    LLM service input
llm6-out   LLM service output
```

Session-scoped output uses `::`:

```text
dbs6-out::<session_id>
llm6-out::<session_id>
```

When a service publishes to `channel::`, the hub fills in the sender socket's
current session id.

## DBS Service Commands

Send these commands to `dbs6-in`. Responses are published to `dbs6-out` or
`dbs6-out::<session_id>` when `session_id` is supplied.

All responses include:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-out",
    "content": "commandName",
    "results": [],
    "turn_id": "request uuid"
  }
}
```

Errors include:

```json
{
  "method": "pub",
  "params": {
    "channel": "dbs6-out",
    "content": "commandName",
    "error": "error message",
    "results": [],
    "turn_id": "request uuid"
  }
}
```

### `listConvos`

Required params:

```json
{
  "uuid": "user uuid"
}
```

Response `results`:

```json
[
  ["conversation uuid", "conversation title"]
]
```

### `shortHistory`

Required params:

```json
{
  "uuid": "user uuid",
  "conversation": "conversation uuid"
}
```

Response `results` is a list of simplified messages:

```json
[
  {
    "role": "user",
    "content": "hello",
    "turn_id": "uuid"
  }
]
```

Long histories may be emitted in multiple response messages with the same
`turn_id`.

### `newConvo`

Creates a new conversation.

Optional params:

```json
{
  "template": "default",
  "title": "Conversation title",
  "noprompt": false,
  "model": "llama3.1",
  "meta": {}
}
```

If `noprompt` is true, the conversation is created without a system prompt.
Otherwise `template` defaults to `default`.

Response `results`:

```json
["new conversation uuid"]
```

### `saveTemplate`

Creates or versions a prompt template.

Required params:

```json
{
  "system_prompt": "You are concise."
}
```

Optional params:

```json
{
  "name": "Concise Assistant",
  "slug": "concise",
  "title_template": "New concise chat",
  "model": "llama3.1",
  "meta": {}
}
```

Response `results`:

```json
[
  {
    "id": "template uuid",
    "slug": "concise",
    "name": "Concise Assistant",
    "version": 1,
    "model": "llama3.1",
    "meta": {},
    "active": true
  }
]
```

### `delConvo`

Soft-deletes a conversation.

Required params:

```json
{
  "conversation_id": "conversation uuid"
}
```

Response `results`:

```json
["deleted conversation uuid"]
```

### `saveConvoRound`

Persists one or more history messages to a conversation.

Required params:

```json
{
  "conversation_id": "conversation uuid",
  "messages": [
    {"role": "user", "content": "hello"},
    {"role": "assistant", "content": "hi"}
  ]
}
```

You may send one message as `message` instead of `messages`.

Response `results`:

```json
["memory uuid", "memory uuid"]
```

## LLM Service Input

The LLM service listens on `llm6-in`.

Common params:

```json
{
  "uuid": "user uuid",
  "conversation": "conversation uuid",
  "content": "user message",
  "role": "user",
  "turn_id": "request uuid",
  "session_id": "optional browser session",
  "respond_to": "optional output channel",
  "model": "optional model",
  "stream": true,
  "max_tokens": 512,
  "include_observer_context": true
}
```

Responses are published to `respond_to`, or to `llm6-out`, or to
`llm6-out::<session_id>` when a session id is supplied.

## Example Client

See [examples/hub-pubsub.py](examples/hub-pubsub.py).

For a copyable JavaScript client, see [examples/pubsub.js](examples/pubsub.js).
