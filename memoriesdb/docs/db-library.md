# DB Library

The public DB integration point is:

```python
from memoriesdb import db
```

`memoriesdb.db` re-exports the current DB implementation. Prefer this import in
external packages instead of importing from `memoriesdb.lib.db` directly.

These functions expect the database schema from `sql/` and connection settings
from environment variables loaded by `.env`.

## User Context

### `get_current_user_id()`

Returns the current in-process user id. The default is the system/test user:

```text
00000000-0000-0000-0000-000000000000
```

```python
from memoriesdb import db

user_id = db.get_current_user_id()
```

### `set_current_user_id(user_id)`

Sets the in-process user id used by helpers that default to current user.

```python
db.set_current_user_id("00000000-0000-0000-0000-000000000000")
```

### `check_valid_uuid(user_id)`

Checks that a user id exists and matches `USER_PASSWORD` by comparing the stored
digest. It returns the user id or exits with `SystemExit`.

## Conversations

### `get_user_conversations(user_id)`

Yields conversation rows for a user. Rows are memory records where `kind` is
`convo`.

```python
for row in db.get_user_conversations(user_id):
    print(row["id"], row["content"])
```

Expected row fields include:

```json
{
  "id": "uuid",
  "kind": "convo",
  "content": "conversation title",
  "created_by": "user uuid"
}
```

### `get_last_conversation(user_id)`

Returns the latest conversation row for a user, or `None`.

```python
convo = db.get_last_conversation(user_id)
if convo:
    print(convo["id"], convo["content"])
```

### `load_simplified_convo(convo_id, user_id, reverse=False)`

Yields conversation history in the minimal shape suitable for an LLM context
window.

```python
messages = list(db.load_simplified_convo(str(convo["id"]), user_id))
```

Typical message shape:

```json
{
  "role": "user",
  "content": "hello",
  "turn_id": "uuid"
}
```

Optional fields can include `done`, `images`, `tool_name`, `tool_calls`, and
`thinking`.

### `create_convo_without_prompt(user_id=None, title=None, model=None, meta=None)`

Creates an empty conversation, optionally with metadata and a model marker.
Returns `(convo_id, title)`.

```python
convo_id, title = db.create_convo_without_prompt(user_id, title="Scratch")
```

### `create_convo_from_template(template, user_id=None, title=None, model=None, meta=None)`

Creates a conversation using an active prompt template slug or id. Returns
`(convo_id, title)`.

```python
convo_id, title = db.create_convo_from_template("default", user_id)
```

### `save_convo_round(convo_id, user_id, messages)`

Persists one or more history messages and links them to a conversation. Returns
the created memory ids.

```python
ids = db.save_convo_round(convo_id, user_id, [
    {"role": "user", "content": "hello"},
    {"role": "assistant", "content": "hi"}
])
```

### `delete_conversation(convo_id, user_id)`

Soft-deletes a conversation and its messages for a user. Returns the number of
rows marked deleted.

```python
count = db.delete_conversation(convo_id, user_id)
```

## Memories And Edges

### `create_memory(content, user_id=None, kind=None, metadata=None, content_embedding=None, **kw)`

Creates a memory record and returns its id.

```python
memory_id = db.create_memory(
    "Remember this",
    user_id=user_id,
    kind="note",
    metadata={"source": "example"}
)
```

Extra keyword arguments are merged into `_metadata`.

### `get_memory_by_id(memory_id)`

Returns a memory row or `None`.

```python
memory = db.get_memory_by_id(memory_id)
```

### `create_memory_edge(source_id, target_id, relation, strength=None, confidence=None, metadata=None)`

Creates a directed edge between two memories and returns the edge id.

```python
edge_id = db.create_memory_edge(memory_id, convo_id, "belongs_to")
```

## Templates

### `save_template(system_prompt, name=None, slug=None, model=None, meta=None, title_template=None, user_id=None)`

Creates a versioned prompt template row, or returns the latest unchanged row if
the payload is identical.

```python
template = db.save_template(
    "You are concise.",
    name="Concise Assistant",
    slug="concise",
    model="llama3.1",
    user_id=user_id
)
```

Return shape:

```json
{
  "id": "uuid",
  "slug": "concise",
  "name": "Concise Assistant",
  "version": 1,
  "model": "llama3.1",
  "meta": {},
  "active": true
}
```

### `get_template(template)`

Fetches the latest active template by slug or id.

```python
template = db.get_template("default")
```

## Events

### `create_event(turn_id, event_kind, content="", user_id=None, metadata=None, **kw)`

Creates an event record for tracing requests/responses and returns the event id.

```python
event_id = db.create_event(
    turn_id,
    "agent_note",
    content="started task",
    user_id=user_id,
    metadata={"source": "external-package"}
)
```

## Search

### `semantic_search(query, user_id=None, limit=10, similarity_threshold=0.7)`

Generates an embedding with Ollama and searches memories by vector similarity.

```python
results = db.semantic_search("database design", user_id=user_id, limit=5)
```

### `search_memories_vector(query_embedding, user_id=None, limit=10, similarity_threshold=0.7)`

Searches using a caller-provided embedding.

```python
results = db.search_memories_vector(embedding, user_id=user_id)
```

## Public Contract

Use `memoriesdb.db` from external packages. `memoriesdb.lib.db` is the current
implementation module and can change as the package is cleaned up.

