# Chat Data Model in the Graph

This project stores chat sessions and messages **inside the generic graph schema** (`memories` / `memory_edges`). No extra tables are required.

---

## Tables recap

| table | purpose |
|-------|---------|
| `memories` | **nodes** ― any entity in the graph |
| `memory_edges` | **edges** ― relations between nodes |

---

## Node types

### `chat_session`
```
memories.kind = 'chat_session'
```
| column               | description                                  |
|----------------------|----------------------------------------------|
| `id` (UUID)          | session ID                                   |
| `content` (TEXT)     | session *title*                              |
| `_metadata` (JSONB)  | ```json
  {
    "user_id": "<owner-uuid>",
    "created_at": "<iso8601>",
    "forked_from": "<parent-sid> | null",
    "forked_at":  "<msg-id> | null"
  }
  ``` |

### `chat_message`
```
memories.kind = 'chat_message'
```
| column               | description |
|----------------------|-------------|
| `id` (UUID)          | message ID |
| `content` (TEXT)     | raw message text |
| `_metadata` (JSONB)  | ```json
  {
    "role": "user | assistant | tool",
    "timestamp": "<iso8601>",
    "name": "<function name> | null",
    "function_call": { … } | null
  }
  ``` |

---

## Edge types

| relation        | `source_id` → `target_id` | purpose |
|-----------------|---------------------------|---------|
| `has_message`    | session → message         | message belongs to session |
| `belongs_to`    | message → session         | inverse of `has_message` |
| `forked_from`   | child session → parent session | child derives from parent |

`
memory_edges(id, source_id, target_id, relation, _metadata)
`

`_metadata` is unused for the above edges (can be `NULL`).

---

## Typical operations

### Create session
1. Insert one *chat_session* node.
2. Insert N *chat_message* nodes.
3. Insert N `in_session` edges.

### Fork session
1. Insert child *chat_session* node (copies title + “(fork)”).
2. Insert `forked_from` edge child → parent.
3. Optionally record `forked_at` (message ID cut-point).

### Fetch session
```
SELECT * FROM memories WHERE id = :sid AND kind = 'chat_session';
JOIN memory_edges ON source_id = :sid AND relation='in_session'
JOIN memories AS m ON m.id = target_id  -- messages
ORDER BY (m._metadata->>'timestamp')::timestamptz, m.id;
```

### Session history (follow forks)
Iteratively walk `forked_from` edges upward, merging message lists and truncating at each fork point.

---

## Rationale
* **Single schema** – chat is just another domain on the graph.
* **Uniform queries** – no special tables; edges capture relationships.
* **Versioning/Forks** – handled naturally via `forked_from` edges.
* **Extensibility** – add new relations (e.g., `replied_to`) without migrations.
