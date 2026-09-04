# AI Quickstart

This repo has two stable integration surfaces:

- DB library: `from memoriesdb import db`
- Pub/sub hub: WebSocket protocol at `ws://localhost:5002/ws`
- Python agents: `from memoriesdb.agent import SubAgentBase`

Use these docs as the contract for external packages and AI coding agents.
Avoid relying on internal modules unless you are changing this repo itself.

## Install From A Sibling Repo

From another Python project:

```bash
uv add --editable ../memoriesdb
```

Use editable installs while developing so changes in this repo are visible to
the consuming project.

## Start MemoriesDB Services

From this repo:

```bash
uv run --env-file=.env honcho start
```

This starts the pub/sub hub, DB service, and LLM service from `Procfile`.

If port `5002` is already in use, stop the existing hub process before starting
another one.

## DB Library

External packages should import the public DB facade:

```python
from memoriesdb import db

user_id = db.get_current_user_id()
last = db.get_last_conversation(user_id)

if last:
    messages = list(db.load_simplified_convo(str(last["id"]), user_id))
```

See [db-library.md](db-library.md) for the DB API contract.

## Pub/Sub Hub

Internal tools and agents communicate over WebSocket channels:

```text
ws://localhost:5002/ws?c=dbs6-out
```

Internal service clients authenticate with:

```text
X-Internal-Secret: <INTERNAL_SECRET>
```

Send publishes as two frames:

```python
ws.send("dbs6-in")
ws.send(json.dumps({
    "method": "pub",
    "params": {
        "channel": "dbs6-in",
        "content": "listConvos",
        "uuid": "00000000-0000-0000-0000-000000000000",
        "turn_id": "request-id"
    }
}))
```

See [hub-protocol.md](hub-protocol.md) for channels, message shapes, and DB
service commands.

## Python Agents

External packages can define hub agents with:

```python
from memoriesdb.agent import SubAgentBase
```

Agents listen on `<NAME>-in` and publish to `<NAME>-out`. See
[python-agents.md](python-agents.md).

Browser clients authenticate with the `session` cookie. Internal agents use
`X-Internal-Secret`. See [auth-and-cookies.md](auth-and-cookies.md).

## Process Readiness

Services coordinate with ready files written by `pidwatcher`:

```python
from pidwatcher import PidFileWatcher

PidFileWatcher("hub.ready").wait()
```

Known ready files:

```text
hub.ready or pubsubhub.ready
dbs.ready
```

Use `pubsubhub.ready` when the `Procfile` starts the standalone `pubsubhub`
process. Use `hub.ready` when running `memoriesdb.services.hub` directly.

See [process-readiness.md](process-readiness.md).

## Stable vs Internal

Stable for external consumers:

- `memoriesdb.db`
- `memoriesdb.agent`
- Hub protocol documented in [hub-protocol.md](hub-protocol.md)
- Browser cookie and internal-secret auth documented in [auth-and-cookies.md](auth-and-cookies.md)
- Ready-file behavior documented in [process-readiness.md](process-readiness.md)

Internal implementation:

- `memoriesdb.lib.*`
- `memoriesdb.services.*`
- `argh*`, `noo`, `b4`
