-- Initial Data Load for MemoriesDB
-- ===============================
-- This script loads the system user
-- Run after schema setup: psql -U memories_user -d memories -f 002_load_data.sql

-- ===========================
-- SYSTEM USER
-- ===========================

-- Insert the system user if it doesn't exist
-- This user will be used for system-generated content and operations
INSERT INTO users (id, digest, email, created_at)
VALUES ('00000000-0000-0000-0000-000000000000', md5('el passwordo'), 'system@memoriesdb', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, digest, email, created_at)
VALUES (
  'caa865c7-665c-40c2-b795-ea19c1bee424',
  '9a900403ac313ba27a1bc81f0932652b8020dac92c234d98fa0b06bf0040ecfd',
  'x@x.com', NOW()
);


-- ===========================
-- DEFAULT PROMPT TEMPLATE
-- ===========================

INSERT INTO prompt_templates
    (slug, name, version, title_template, system_prompt, model, meta, active, created_by, updated_by)
VALUES
    (
        'default',
        'Default Conversation',
        1,
        'New Conversation',
        'You are a helpful assistant.',
        'llama3.1',
        '{}'::jsonb,
        TRUE,
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000000'
    )
ON CONFLICT (slug, version) DO NOTHING;

-- ===========================
-- NOTIFICATION
-- ===========================

\echo ""
\echo "✅ System user created with ID: 00000000-0000-0000-0000-000000000000"
\echo "✅ Default prompt template created with slug: default"
\echo ""
