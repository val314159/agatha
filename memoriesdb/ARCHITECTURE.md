# Architecture

## Directory Structure

```
memoriesdb/
├── memoriesdb/
│   ├── db.py         # Public DB facade for external packages
│   ├── lib/          # Core library code
│   │   ├── db.py     # Database operations (memories, edges, search)
│   │   ├── auth.py   # Authentication and session management
│   │   ├── config.py # Configuration
│   │   ├── logging_setup.py  # Logging configuration
│   │   ├── conversation.py   # Conversation management
│   │   ├── funcs2.py         # Tool functions for LLM
│   │   └── subagent.py       # Base class for WebSocket agents
│   └── services/     # Long-running services
│       ├── hub.py    # HTTP/WebSocket server (auth, routing)
│       ├── dbs6.py   # WebSocket service for DB operations
│       └── llm8.py   # LLM service used by Procfile
│   └── cli/          # Command-line tools
│       ├── list_convos.py    # List user conversations
│       ├── show_convo.py     # Display conversation history
│       └── chat6.py          # CLI chat client
├── public/           # Frontend
│   └── ref/
│       ├── wsapp.js  # WebSocket base class
│       ├── app.js    # Frontend application
│       └── index.html
├── sql/              # Database schemas
├── tests/            # Tests
└── modelfiles/       # Ollama model files
```

## Component Responsibilities

### memoriesdb.db (Public DB Facade)

External packages should use:

```python
from memoriesdb import db
```

This re-exports the current DB implementation from `memoriesdb.lib.db`.

### memoriesdb/lib/ (Core Library)

**db.py** - Single database layer
- All database operations (no direct DB queries elsewhere)
- Memory CRUD operations
- Edge management
- Vector search
- Conversation loading/saving

**auth.py** - Authentication & sessions
- User login/logout
- Session management
- CSRF protection
- Session validation

**config.py** - Configuration
- Database connection strings
- Model configuration
- Environment variables

**logging_setup.py** - Logging
- Centralized logging configuration

- Load conversations from YAML/TXT files
- Used by CLI tools and services

**conversation.py** - Conversation logic
- Ephemeral conversation proxy
- Chat round management

**funcs2.py** - LLM tools
- Tool functions available to LLM

**subagent.py** - Agent base class
- WebSocket agent base class
- Used by services

### memoriesdb/services/ (Long-running Services)

**hub.py** - HTTP/WebSocket server
- HTTP endpoints: `/login`, `/logout`, `/register`, `/auth/status`
- WebSocket routing and session management
- No database queries - uses `auth.py` and `db.py`

**dbs6.py** - WebSocket DB service
- Handles DB operations via WebSocket
- `listConvos`, `shortHistory`, `newConvo`, `saveTemplate`, `delConvo`, `saveConvoRound` commands

**llm8.py** - LLM service used by `Procfile`
- LLM WebSocket agent
- Manages conversation state and tool calls

### memoriesdb/cli/ (Command-line Tools)

- Loads YAML/TXT files into database

**list_convos.py** - List conversations
- Lists all conversations for a user

**show_convo.py** - Display conversation
- Shows conversation history

**chat6.py** - CLI chat client
- Terminal-based chat interface

## Import Pattern

Package modules import through the package namespace:

```python
from memoriesdb.lib.db import ...
from memoriesdb.lib.auth import ...
```

External packages should prefer the public facade:

```python
from memoriesdb import db
```

## Key Design Decisions

1. **Single DB layer** - All database operations go through `memoriesdb/lib/db.py`
2. **Separation of concerns** - HTTP/WebSocket routing in `memoriesdb/services/`, CLI tools in `memoriesdb/cli/`, core logic in `memoriesdb/lib/`
3. **Public DB facade** - External packages import `memoriesdb.db`
4. **Session management centralized** - Auth logic lives in `memoriesdb/lib/auth.py`
5. **CLI tools are thin wrappers** - Most logic lives in `memoriesdb/lib/` or the hub protocol

## Data Flow

1. **HTTP/WebSocket request** -> `memoriesdb/services/hub.py`
2. **Auth check** -> `memoriesdb/lib/auth.py`
3. **DB operations** -> `memoriesdb/lib/db.py`
4. **LLM requests** -> `memoriesdb/services/llm8.py` -> uses `memoriesdb/lib/conversation.py`, `memoriesdb/lib/funcs2.py`

## Database Schema

- `memories` - Stored memories with embeddings
- `memory_edges` - Relationships between memories
- `users` - User accounts
- `sessions` - User sessions

See `sql/` directory for schema definitions.
