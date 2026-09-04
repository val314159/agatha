# Pub/Sub Messaging

## Overview

The system uses WebSocket-based pub/sub messaging for real-time communication between clients and services.

## Channels

### Standard Channels

**`llm6-in`** - Messages to LLM service
**`llm6-out`** - Responses from LLM service
**`dbs6-in`** - Messages to database service
**`dbs6-out`** - Responses from database service

### Session-Specific Channels

Channels can be scoped to sessions using the format:
```
<channel>::<session_id>
```

Example: `llm6-out::abc123-session-token`

This allows routing messages to specific clients connected to the same channel but different sessions.

## Message Format

All messages follow this structure:

```json
{
  "method": "pub",
  "params": {
    "channel": "target-channel",
    "content": "message content",
    "role": "user|system|assistant",
    "uuid": "<user_id>",
    "conversation": "<conversation_id>",
    "session_id": "<session_id>",
    "thinking": "optional thinking content",
    "done": true,
    "images": ["base64-encoded-image"],
    "tool_calls": [...],
    "tool_name": "tool_name"
  }
}
```

## Database Service Commands

### `listConvos`

List all conversations for a user.

**Request:**
```json
{
  "content": "listConvos",
  "uuid": "<user_id>",
  "session_id": "<session_id>"
}
```

**Response:**
```json
{
  "content": "listConvos",
  "results": [
    ["<conversation_id>", "Conversation Title"],
    ["<conversation_id>", "Another Title"]
  ]
}
```

### `shortHistory`

Load conversation history.

**Request:**
```json
{
  "content": "shortHistory",
  "uuid": "<user_id>",
  "conversation": "<conversation_id>",
  "session_id": "<session_id>"
}
```

**Response:**
```json
{
  "content": "shortHistory",
  "results": [
    {
      "role": "user",
      "content": "message content"
    },
    {
      "role": "assistant",
      "content": "response content"
    }
  ]
}
```

### `newConvo`

Create a new conversation.

**Request:**
```json
{
  "content": "newConvo",
  "uuid": "<user_id>",
  "session_id": "<session_id>"
}
```

**Response:**
```json
{
  "content": "newConvo",
  "results": ["<conversation_id>"]
}
```

## LLM Service Messages

### User Message

```json
{
  "content": "user message",
  "role": "user",
  "uuid": "<user_id>",
  "conversation": "<conversation_id>",
  "session_id": "<session_id>"
}
```

### Thinking Response

```json
{
  "thinking": "thinking content",
  "role": "assistant",
  "uuid": "<user_id>",
  "conversation": "<conversation_id>",
  "session_id": "<session_id>"
}
```

### Content Response

```json
{
  "content": "response content",
  "role": "assistant",
  "uuid": "<user_id>",
  "conversation": "<conversation_id>",
  "session_id": "<session_id>"
}
```

### Done Signal

```json
{
  "done": true,
  "role": "assistant",
  "uuid": "<user_id>",
  "conversation": "<conversation_id>",
  "session_id": "<session_id>"
}
```

## Message Flow

1. Client connects to `/ws` with channels
2. Server sends `initialize` message with session info
3. Client publishes messages to channels
4. Services handle messages and publish responses
5. Session-based routing ensures messages go to correct client

## Error Handling

Invalid messages are logged but don't disconnect the connection.

**Unknown Method:**
```json
{
  "method": "pub",
  "params": {
    "channel": "unknown",
    "content": "..."
  }
}
```

Server logs: `BAD METHOD: pub`
