import os
from urllib.parse import quote

DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# Default connection values for Docker setup
# Support both naming conventions (PG_* and POSTGRES_*)
PG_USER = os.getenv("POSTGRES_USER", os.getenv("PG_USER", "memories_user"))
PG_PASS = os.getenv("POSTGRES_PASSWORD", os.getenv("PG_PASS", "your_secure_password"))
PG_HOST = os.getenv("PG_HOST", "localhost")
PG_PORT = os.getenv("PG_PORT", "54321")
PG_DB = os.getenv("POSTGRES_DB", os.getenv("PG_DB", "memories"))

# Build connection string from individual parameters
PG_STATEMENT_TIMEOUT_MS = os.getenv("PG_STATEMENT_TIMEOUT_MS", "15000")
PG_LOCK_TIMEOUT_MS = os.getenv("PG_LOCK_TIMEOUT_MS", "5000")
PG_IDLE_TX_TIMEOUT_MS = os.getenv("PG_IDLE_TX_TIMEOUT_MS", "30000")
PG_TIMEOUT_OPTIONS = quote(
    f"-c statement_timeout={PG_STATEMENT_TIMEOUT_MS} "
    f"-c lock_timeout={PG_LOCK_TIMEOUT_MS} "
    f"-c idle_in_transaction_session_timeout={PG_IDLE_TX_TIMEOUT_MS}",
    safe=""
)

DSN = (
    f"postgresql://{PG_USER}:{PG_PASS}@{PG_HOST}:{PG_PORT}/{PG_DB}"
    f"?options={PG_TIMEOUT_OPTIONS}"
)
DSN2 = (
    f"postgresql://{PG_USER}:{PG_PASS}@{PG_HOST}:5432/{PG_DB}"
    f"?options={PG_TIMEOUT_OPTIONS}"
)

# Ollama endpoint if not debug
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

# Model configurations
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-minilm")  # Default embedding model
CHAT_MODEL = os.getenv("CHAT_MODEL", "llama3.1")  # Default chat/tool-calling model

# Logging
LOG_FILE = os.getenv("LOG_FILE", "")  # Set to a filename to enable file logging


# Ollama options

STREAM = bool(os.getenv('STREAM', True))
THINK =  bool(os.getenv('THINK',  True))
TOOLS =  bool(os.getenv('TOOLS',  True))

