CREATE TYPE task_state AS ENUM (
    'IDLE',    -- not started
    'WAITING', -- dependencies not satisfied
    'RUNNING', -- process or watcher tasks
    'BLOCKED', -- human interevention needed
    'DONE'     -- process or manual tasks
);
CREATE TYPE job_state AS ENUM (
    'PENDING',
    'RUNNING',
    'SUCCESS',
    'FAILURE'
);
CREATE TABLE workflows (
    id text PRIMARY KEY,
    display_name text,
    frozen bool NOT NULL DEFAULT FALSE,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE tasks (
    workflow_id text NOT NULL
        REFERENCES workflows(id) ON DELETE CASCADE,
    id text NOT NULL,
    display_name text,
    python_class text,
    task_state task_state NOT NULL DEFAULT 'IDLE',
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (workflow_id, id)
);
CREATE TABLE relations (
    workflow_id text NOT NULL,
    source_id text NOT NULL,
    target_id text NOT NULL,
    kind text NOT NULL DEFAULT 'satisfies',
    PRIMARY KEY (workflow_id, source_id, kind, target_id),
    FOREIGN KEY (workflow_id, target_id)
        REFERENCES tasks(workflow_id, id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_id, source_id)
        REFERENCES tasks(workflow_id, id) ON DELETE CASCADE
);
CREATE INDEX relations_idx ON relations(workflow_id, target_id);
CREATE TABLE jobs (
    id text PRIMARY KEY,
    task_workflow_id text NOT NULL,
    task_id text NOT NULL,
    celery_task_id text NOT NULL UNIQUE,
    job_state job_state NOT NULL DEFAULT 'PENDING',
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz DEFAULT now() NOT NULL,
    started_at  timestamptz,
    finished_at timestamptz,
    FOREIGN KEY (task_workflow_id, task_id)
        REFERENCES tasks(workflow_id, id) ON DELETE CASCADE
);
CREATE INDEX jobs_task_id_idx ON jobs(task_workflow_id, task_id);
