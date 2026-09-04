# MemoriesDB Agent Guide

Start with [docs/ai-quickstart.md](docs/ai-quickstart.md).

## Stable Integration Surfaces

- DB library: `from memoriesdb import db`
- Pub/sub hub: protocol documented in [docs/hub-protocol.md](docs/hub-protocol.md)
- Python agents: `from memoriesdb.agent import SubAgentBase`
- Auth and cookies: documented in [docs/auth-and-cookies.md](docs/auth-and-cookies.md)
- Process readiness: ready files documented in [docs/process-readiness.md](docs/process-readiness.md)

Use these surfaces when integrating MemoriesDB from another repo.

## Development Install

From a sibling project:

```bash
uv add --editable ../memoriesdb
```

## Run Services

From this repo:

```bash
uv run --env-file=.env honcho start
```

This starts the hub, DB service, and LLM service defined in `Procfile`.

## Public vs Internal

Stable for external consumers:

- `memoriesdb.db`
- `memoriesdb.agent`
- Hub WebSocket messages documented in `docs/hub-protocol.md`
- Browser cookie auth and internal-agent auth documented in `docs/auth-and-cookies.md`
- Ready files `hub.ready` and `dbs.ready`

Internal implementation:

- `memoriesdb.lib.*`
- `memoriesdb.services.*`
- `argh*`
- `noo`
- `b4`

Do not import internal modules from another package unless the task is to change
MemoriesDB itself.

## Common Tasks

Read or write conversation data:

```python
from memoriesdb import db
```

Write a Python hub agent:

```python
from memoriesdb.agent import SubAgentBase
```

Send realtime messages:

```text
ws://localhost:5002/ws?c=<channel>
```

Wait for the hub before connecting:

```python
from pidwatcher import PidFileWatcher

PidFileWatcher("hub.ready").wait()
```

Wait for the DB service before sending `dbs6` commands:

```python
from pidwatcher import PidFileWatcher

PidFileWatcher("hub.ready", "dbs.ready").wait()
```

## Documentation Map

- [docs/ai-quickstart.md](docs/ai-quickstart.md): first stop for external integrations and AI agents
- [docs/db-library.md](docs/db-library.md): public Python DB API
- [docs/hub-protocol.md](docs/hub-protocol.md): WebSocket channels, message format, and `dbs6` commands
- [docs/python-agents.md](docs/python-agents.md): Python agent base class and channel conventions
- [docs/auth-and-cookies.md](docs/auth-and-cookies.md): login, cookies, and internal-secret auth
- [docs/process-readiness.md](docs/process-readiness.md): ready-file startup contract
