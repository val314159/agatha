# AGENTS

This repository is intentionally small and local-first. The active code path is
`src/mtd/lib/task_store.py`; the executable wrappers under `tools/mtd/` should
stay thin.

## Core Rules

- Keep SQLite as the source of truth.
- Keep PubSubHub publishing optional and environment-controlled.
- Do not put long-running service logic in the task tools.
- Prefer stdlib code unless a dependency is already declared in
  `pyproject.toml`.
- Preserve the JSON-stdin and JSON-stdout behavior of `tools/mtd/*`.

## PubSubHub Contract

Task mutations may publish after a successful commit when `MTD_PUBSUB=1`.
Publishing should not happen before the database write commits.

Default settings:

```bash
MTD_PUBSUB_URL=ws://localhost:5002/ws
MTD_PUBSUB_CHANNEL=mtd-events
MTD_PUBSUB_SECRET=${INTERNAL_SECRET:-dev-secret}
```

The configured channel can be changed, for example:

```bash
MTD_PUBSUB_CHANNEL=mtd-messages
```

Published messages use the MemoriesDB hub format:

```json
{
  "method": "pub",
  "params": {
    "channel": "mtd-events",
    "content": "mtd.event",
    "event": "task.updated",
    "uuid": "tasks",
    "task_id": "task-01",
    "previous_state": "READY",
    "task": {
      "id": "task-01",
      "title": "Example",
      "state": "RUNNING"
    }
  }
}
```

`uuid` must come from the repository's `UUID` environment value, defaulting to
`tasks`.

Current event names:

- `task.created`
- `task.updated`
- `task.completed`

By default, publish failures are best effort and must not fail a committed task
mutation. `MTD_PUBSUB_STRICT=1` is the opt-in mode for making publish failures
fatal.
