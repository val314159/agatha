# MemoriesDB

A graph database for memory management with vector search and conversation tracking. Stores memories as nodes and relationships as edges.

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture, directory structure, and design decisions
- **[API.md](API.md)** - HTTP and WebSocket API endpoints
- **[PUBSUB.md](PUBSUB.md)** - Pub/sub messaging channels and message formats
- **[docs/ai-quickstart.md](docs/ai-quickstart.md)** - Start here when integrating from another repo or with an AI coding agent
- **[docs/db-library.md](docs/db-library.md)** - Public Python DB API via `memoriesdb.db`
- **[docs/hub-protocol.md](docs/hub-protocol.md)** - WebSocket hub protocol and `dbs6` commands
- **[docs/python-agents.md](docs/python-agents.md)** - Python agents using `memoriesdb.agent`
- **[docs/auth-and-cookies.md](docs/auth-and-cookies.md)** - Browser cookie auth and internal agent auth
- **[docs/process-readiness.md](docs/process-readiness.md)** - Ready-file contract for multi-process startup

## Integration Surfaces

- DB library: `from memoriesdb import db`
- Pub/sub hub: `ws://localhost:5002/ws?c=<channel>`
- Python agents: `from memoriesdb.agent import SubAgentBase`
- Process readiness: `PidFileWatcher("hub.ready").wait()`

Stable public API is documented under `docs/`. Treat `memoriesdb.lib.*` and
`memoriesdb.services.*` as implementation modules unless a doc says otherwise.

## Quick Start

```bash
# Setup database
./restart_db.sh

# Start services
uv run --env-file=.env honcho start

# Access frontend
open http://localhost:5002
```

## Structure

```
memoriesdb/
├── memoriesdb/
│   ├── lib/       # Core library code
│   ├── cli/       # Command-line tools
│   └── services/  # Long-running services
└── public/       # Frontend
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.
