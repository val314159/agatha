
-- When you run this, don’t forget:
-- SET app.current_user = '<UUID>'; per connection!

-- ===========================
-- EXTENSIONS
-- ===========================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===========================
-- USERS
-- ===========================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    digest TEXT,
    email TEXT UNIQUE NOT NULL,
    state TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================
-- SESSIONS
-- ===========================

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID,
    device_id TEXT,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE UNIQUE INDEX idx_sessions_user_device ON sessions(user_id, device_id) WHERE expires_at > NOW();

-- ===========================
-- MEMORIES
-- ===========================

CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    turn_id UUID,
    kind TEXT,
    content TEXT,
    content_hash BYTEA,
    content_embedding VECTOR(1024),
    _metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    _deleted_at TIMESTAMPTZ
    -- CONSTRAINT unique_content_hash UNIQUE(content_hash),
    -- CONSTRAINT content_not_empty CHECK (content IS NULL OR content != '')
);

-- ===========================
-- EVENTS
-- ===========================

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    turn_id UUID NOT NULL,
    kind TEXT NOT NULL,
    content TEXT,
    _metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================
-- MEMORY EDGES
-- ===========================

CREATE TABLE memory_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    source_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relation TEXT NOT NULL CHECK (relation ~ '^[a-z_]+$'),
    strength REAL CHECK (strength >= -1.1 AND strength <= 1.1),
    confidence REAL CHECK (confidence >= 0.0 AND confidence <= 1.0),
    _metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    CONSTRAINT no_self_reference CHECK (source_id != target_id),
    CONSTRAINT source_target_relation_unique UNIQUE (source_id, target_id, relation)
);

-- ===========================
-- AUDIT LOG
-- ===========================

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    operation TEXT NOT NULL,
    operation_timestamp TIMESTAMPTZ DEFAULT NOW(),
    old_values JSONB,
    new_values JSONB,
    changed_by UUID REFERENCES users(id)
);

-- ===========================
-- EMBEDDING + INDEXING SCHEDULES
-- ===========================

CREATE TABLE embedding_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    rec UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_msg TEXT
);

CREATE INDEX idx_embedding_schedule_unfinished ON embedding_schedule (finished_at) WHERE finished_at IS NULL;
CREATE INDEX idx_embedding_schedule_unstarted ON embedding_schedule (started_at) WHERE started_at IS NULL;

CREATE TABLE vindexing_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    rec UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_msg TEXT
);

CREATE INDEX idx_vindexing_schedule_unfinished ON vindexing_schedule (finished_at) WHERE finished_at IS NULL;
CREATE INDEX idx_vindexing_schedule_unstarted ON vindexing_schedule (started_at) WHERE started_at IS NULL;

-- ===========================
-- INDEXES
-- ===========================

CREATE INDEX idx_memories_content_gin ON memories USING GIN (to_tsvector('english', content));
CREATE INDEX idx_memories_metadata_gin ON memories USING GIN (_metadata);
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (content_embedding vector_cosine_ops);
CREATE INDEX idx_memories_turn_id ON memories(turn_id);

CREATE INDEX idx_events_turn_id ON events(turn_id);
CREATE INDEX idx_events_created_by_created_at ON events(created_by, created_at);

CREATE INDEX idx_memory_edges_source ON memory_edges(source_id);
CREATE INDEX idx_memory_edges_target ON memory_edges(target_id);
CREATE INDEX idx_memory_edges_relation ON memory_edges(relation);
CREATE INDEX idx_memory_edges_metadata_gin ON memory_edges USING GIN (_metadata);

-- ===========================
-- PROMPT TEMPLATES
-- ===========================

CREATE TABLE prompt_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    title_template TEXT,
    system_prompt TEXT NOT NULL,
    model TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT prompt_templates_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]*$')
);

CREATE UNIQUE INDEX idx_prompt_templates_slug_version
ON prompt_templates(slug, version);

CREATE INDEX idx_prompt_templates_active
ON prompt_templates(active);

CREATE INDEX idx_prompt_templates_meta_gin
ON prompt_templates USING GIN (meta);

-- ===========================
-- RECURSIVE GRAPH VIEW
-- ===========================

CREATE MATERIALIZED VIEW memory_graph AS
WITH RECURSIVE graph_search AS (
    SELECT
        id,
        content,
        _metadata,
        ARRAY[id] AS path,
        FALSE AS is_cycle,
        0 AS depth
    FROM memories

    UNION ALL

    SELECT
        m.id,
        m.content,
        m._metadata,
        gs.path || m.id,
        m.id = ANY(gs.path),
        gs.depth + 1
    FROM memories m
    JOIN memory_edges e ON m.id = e.target_id
    JOIN graph_search gs ON e.source_id = gs.id
    WHERE NOT gs.is_cycle
    AND gs.depth < 100
)
SELECT * FROM graph_search;

-- ===========================
-- HASHING + AUDIT + SCHEDULE TRIGGERS
-- ===========================

CREATE OR REPLACE FUNCTION generate_content_hash(content TEXT)
RETURNS BYTEA AS $$
BEGIN
    RETURN digest(content, 'sha256');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_content_hash()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_hash := digest(NEW.content, 'sha256');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_hash_trigger
BEFORE INSERT OR UPDATE OF content ON memories
FOR EACH ROW
EXECUTE FUNCTION update_content_hash();

CREATE OR REPLACE FUNCTION set_prompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prompt_templates_updated_at_trigger
BEFORE UPDATE ON prompt_templates
FOR EACH ROW
EXECUTE FUNCTION set_prompt_templates_updated_at();

CREATE OR REPLACE FUNCTION log_memory_change()
RETURNS TRIGGER AS $$
DECLARE
    app_name text;
    user_id text;
BEGIN
    -- Get the application_name and extract user ID if it follows 'user:UUID' format
    BEGIN
        app_name := current_setting('application_name');
        IF app_name LIKE 'user:%' THEN
            user_id := substring(app_name from '^user:([0-9a-fA-F-]{36})$');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- If application_name is not set or invalid, use NULL
        user_id := NULL;
    END;
    
    INSERT INTO audit_log (table_name, record_id, operation, old_values, new_values, changed_by)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        row_to_json(OLD),
        row_to_json(NEW),
        user_id::uuid  -- This will be NULL if user_id is NULL or invalid
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memories_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON memories
FOR EACH ROW
EXECUTE FUNCTION log_memory_change();

CREATE TRIGGER memory_edges_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON memory_edges
FOR EACH ROW
EXECUTE FUNCTION log_memory_change();

CREATE OR REPLACE FUNCTION queue_embedding()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO embedding_schedule (rec) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER queue_embedding_trigger
AFTER INSERT OR UPDATE ON memories
FOR EACH ROW
EXECUTE FUNCTION queue_embedding();

CREATE OR REPLACE FUNCTION queue_vindexing()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO vindexing_schedule (rec) VALUES (NEW.rec);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER queue_vindexing_trigger
AFTER UPDATE ON embedding_schedule
FOR EACH ROW
WHEN (NEW.finished_at IS NOT NULL)
EXECUTE FUNCTION queue_vindexing();

-- ===========================
-- SEARCH FUNCTIONS
-- ===========================

-- Cosine-only vector search
CREATE OR REPLACE FUNCTION vector_search(query_embedding VECTOR(1024), match_threshold FLOAT, match_count INT)
RETURNS TABLE (id UUID, content TEXT, similarity FLOAT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.content_embedding <#> query_embedding AS similarity
    FROM memories m
    WHERE (m.content_embedding <#> query_embedding) > match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Hybrid trigram + vector search
CREATE OR REPLACE FUNCTION hybrid_search(query_embedding VECTOR(1024), search_term TEXT, trigram_weight FLOAT, vector_weight FLOAT, match_count INT)
RETURNS TABLE (id UUID, content TEXT, hybrid_score FLOAT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        (trigram_weight * similarity(m.content, search_term)::FLOAT) + 
        (vector_weight * (m.content_embedding <#> query_embedding)) AS hybrid_score
    FROM memories m
    WHERE similarity(m.content, search_term) > 0.1
    ORDER BY hybrid_score DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ===========================
-- RLS POLICIES
-- ===========================

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY memory_access_policy ON memories
    USING (created_by = current_setting('app.current_user')::UUID);

CREATE POLICY memory_edge_access_policy ON memory_edges
    USING (created_by = current_setting('app.current_user')::UUID);

-- ===========================
-- FINI
-- ===========================
