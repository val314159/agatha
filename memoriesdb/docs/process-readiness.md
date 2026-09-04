# Process Readiness

MemoriesDB services use `pidwatcher` ready files so dependent processes can
wait for upstream services.

## Ready Files

Known ready files:

```text
hub.ready or pubsubhub.ready
dbs.ready
```

`hub.ready` is written after `memoriesdb.services.hub` binds its WebSocket
server. `pubsubhub.ready` is written after the standalone `pubsubhub` process
binds its WebSocket server.

`dbs.ready` is written by `dbs6` after it receives the hub initialize message.

The LLM service currently waits for `hub.ready` and `dbs.ready`; it does not
write a separate ready file.

## Wait For The Hub

```python
from pidwatcher import PidFileWatcher

PidFileWatcher("hub.ready").wait()
```

When the `Procfile` starts `pubsubhub`, services set `HUB_READY_FILE` to
`pubsubhub.ready` and wait for that file instead.

## Wait For Hub And DB Service

```python
from pidwatcher import PidFileWatcher

PidFileWatcher("hub.ready", "dbs.ready").wait()
```

## Service Startup Order

The `Procfile` starts all processes together. Service code handles ordering:

```text
hub   writes hub.ready or pubsubhub.ready
dbs6  waits for the configured hub ready file, then writes dbs.ready
llm6  waits for the configured hub ready file and dbs.ready
```

For external agents, wait for the ready file written by the hub process before
opening a hub WebSocket. Wait for that hub ready file and `dbs.ready` before
sending DB service commands.
