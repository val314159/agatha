# MemoriesDB Integration Snippet

Copy this section into another repo's `AGENTS.md` when that repo uses
MemoriesDB from a sibling checkout.

```md
## MemoriesDB

MemoriesDB lives at `../memoriesdb`.

Before changing code that stores memories, conversations, realtime messages, or
service startup, read:

1. `../memoriesdb/docs/ai-quickstart.md`
2. `../memoriesdb/docs/db-library.md`
3. `../memoriesdb/docs/hub-protocol.md`
4. `../memoriesdb/docs/python-agents.md`
5. `../memoriesdb/docs/auth-and-cookies.md`
6. `../memoriesdb/docs/process-readiness.md`

Use stable MemoriesDB integration surfaces only:

- DB library: `from memoriesdb import db`
- Pub/sub hub: protocol documented in `../memoriesdb/docs/hub-protocol.md`
- Python agents: `from memoriesdb.agent import SubAgentBase`
- Browser cookie auth and internal-agent auth: documented in `../memoriesdb/docs/auth-and-cookies.md`
- Process readiness: ready files documented in `../memoriesdb/docs/process-readiness.md`

Do not import from `memoriesdb.lib.*` or `memoriesdb.services.*` unless the task
is to modify MemoriesDB itself.

Development install:

```bash
uv add --editable ../memoriesdb
```

Run MemoriesDB services from the MemoriesDB repo:

```bash
cd ../memoriesdb
uv run --env-file=.env honcho start
```

Wait for the hub before opening a WebSocket:

```python
from pidwatcher import PidFileWatcher

PidFileWatcher("hub.ready").wait()
```

Wait for DB service commands:

```python
from pidwatcher import PidFileWatcher

PidFileWatcher("hub.ready", "dbs.ready").wait()
```
```
