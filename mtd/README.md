# mtd

`mtd` is a small local task store backed by SQLite. The current task database
defaults to `~/.mtd-llm/${UUID}.sqlite3`, where `UUID` defaults to `tasks`.

The command tools live under `tools/mtd/` and read JSON payloads from stdin.

## Task Tools

Examples:

```bash
printf '{"title":"Write frontend subscriber","state":"READY"}' \
  | PYTHONPATH=src tools/mtd/create_task

printf '{"states":["READY","RUNNING"]}' \
  | PYTHONPATH=src tools/mtd/list_tasks

printf '{"id":"task-01","state:replace":"RUNNING"}' \
  | PYTHONPATH=src tools/mtd/update_task

printf '{"id":"task-01","notes":"Finished"}' \
  | PYTHONPATH=src tools/mtd/complete_task
```

## Configuration

`UUID`
: Selects the task namespace and default database filename. Default: `tasks`.

`MTD_TASK_DB`
: Overrides the SQLite database path.

## PubSubHub Updates

MTD can publish task changes to the MemoriesDB PubSubHub after successful SQLite
commits. Publishing is disabled by default.

Enable it with:

```bash
MTD_PUBSUB=1
```

Pub/sub settings:

```bash
MTD_PUBSUB_URL=ws://localhost:5002/ws
MTD_PUBSUB_CHANNEL=mtd-events
MTD_PUBSUB_SECRET=dev-secret
MTD_PUBSUB_STRICT=1
```

`MTD_PUBSUB_SECRET` falls back to `INTERNAL_SECRET`, then `dev-secret`.
`MTD_PUBSUB_STRICT=1` makes publish failures fatal. Without strict mode, task
mutations still succeed if the hub is unavailable.

To use a channel named `mtd-messages`:

```bash
MTD_PUBSUB=1 MTD_PUBSUB_CHANNEL=mtd-messages
```

All messages are published on the configured channel with `content:
"mtd.event"`. The event type is carried in `params.event`.

Example `task.created` message:

```json
{
  "method": "pub",
  "params": {
    "channel": "mtd-events",
    "content": "mtd.event",
    "event": "task.created",
    "uuid": "tasks",
    "task_id": "task-01",
    "task": {
      "id": "task-01",
      "title": "Write frontend subscriber",
      "notes": "",
      "state": "READY"
    }
  }
}
```

Published event names:

- `task.created`
- `task.updated`
- `task.completed`

Subscribers should treat PubSubHub messages as live notifications, not as the
source of truth. Load a full task snapshot from SQLite-backed MTD state, then
apply incoming pub/sub messages as live updates.
