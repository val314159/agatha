# MTD

MTD is a small workflow/task runner backed by Postgres, SQLAlchemy, and Celery.

The current model is intentionally simple:

- A `Workflow` owns task records.
- A task record has a peer class selected by `python_class`.
- A `Job` records one concrete process execution for a task.
- Celery workers run background jobs and write final job/task state back to Postgres.

## Current Model

The generated SQLAlchemy models live in `src/mtd/models.py`.

Core tables:

- `workflows`: workflow header and metadata.
- `tasks`: workflow nodes.
- `relations`: edges between tasks.
- `jobs`: process attempts for task records.

Task states:

- `IDLE`: inactive; dependency evaluation may later make it actionable.
- `WAITING`: reserved for expected waiting.
- `RUNNING`: an active job or action is in progress.
- `BLOCKED`: automatic progress stopped; outside action is required.
- `DONE`: completed successfully.

Job states:

- `PENDING`: job row exists but worker has not claimed it.
- `RUNNING`: worker claimed the job and started execution.
- `SUCCESS`: process completed with return code `0`.
- `FAILURE`: process completed with a nonzero return code.

## Peer Tasks

`TaskMixin.peer` maps the database value in `python_class` to a class in
`mtd.tasks`:

```text
Manual   -> ManualTask
Watcher  -> WatcherTask
Process  -> ProcessTask
Complete -> CompleteTask
```

Peer classes expose explicit flags:

```python
MANUAL = False
WATCHER = False
PROCESS = False
COMPLETE = False
```

Manual tasks are intended for human intervention. A scheduler can move them
from `IDLE` to `BLOCKED` once their dependencies are satisfied, meaning they are
ready for a human to act.

Process tasks are intended for automated work. They create a `Job`, enqueue a
Celery task, and move through `PENDING -> RUNNING -> SUCCESS/FAILURE`.

## Running

Build and run the Docker container:

```bash
make docker
```

Open a shell in a running container:

```bash
make exec
```

The container initializes Postgres at runtime, loads `src/sql/*.sql`, and starts
Celery under supervisord.

## Celery

The Celery app is defined in `mtd.worker` and should be launched explicitly:

```bash
celery -A mtd.worker:celery worker --loglevel=info
```

Periodic task configuration is loaded from `mtd.schedule` with:

```python
celery.config_from_object("mtd.schedule")
```

That loads schedule configuration; it does not start Celery Beat by itself.

## Examples

`src/better_example.py` builds a sample meatloaf workflow and writes a demo
`/app/Makefile` with targets that print `DOING <target>`, sleep, then print
`DONE <target>`.

## TODO

The next major piece is a workflow `step()` function.

`step()` should manage state and dependencies:

- find `IDLE` tasks whose input dependencies are satisfied
- immediately start ready process tasks
- mark ready manual tasks as `BLOCKED`
- evaluate watcher/complete tasks
- publish or return whether the workflow is complete

A likely return shape:

```python
StepResult(changed=True, complete=False)
```

This is not required for defining workflows yet, but it is the next layer needed
for automatic workflow progression.

## License

MIT
