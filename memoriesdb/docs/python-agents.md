# Python Agents

Python agents are long-running processes that connect to the hub, subscribe to
`<NAME>-in`, and publish to `<NAME>-out`.

Use the public agent API:

```python
from memoriesdb.agent import SubAgentBase, OUT_CHANNEL
```

Do not import `memoriesdb.lib.subagent` from external packages.

## Minimal Agent

```python
#!/usr/bin/env python3
from pidwatcher import PidFileWatcher, write_pid_file

from memoriesdb.agent import OUT_CHANNEL, SubAgentBase


class EchoAgent(SubAgentBase):
    def initialize(self, params):
        write_pid_file("echo.ready")

    def _pub(self, content, uuid, conversation=None, turn_id=None, **kw):
        self.publish(OUT_CHANNEL, {
            "content": content,
            "uuid": uuid,
            "conversation": conversation,
            "turn_id": turn_id,
            "role": "assistant",
        })


if __name__ == "__main__":
    PidFileWatcher("hub.ready").wait()
    EchoAgent().main()
```

Run it with:

```bash
NAME=echo uv run python echo_agent.py
```

It listens on:

```text
echo-in
```

and publishes on:

```text
echo-out
```

## Message Handling

Override `_pub()` to handle published messages:

```python
def _pub(self, content, uuid, conversation=None, turn_id=None, **kw):
    ...
```

Common fields:

- `content`: command or user text
- `uuid`: user id
- `conversation`: conversation id or `None`
- `turn_id`: request id to echo in responses
- `session_id`: browser session token for session-scoped replies

## Publishing

Use `publish(channel, msg)`:

```python
self.publish(OUT_CHANNEL, {
    "content": "done",
    "uuid": uuid,
    "conversation": conversation,
    "turn_id": turn_id,
})
```

The helper sends the two-frame hub publish format.

## Readiness

Wait for the hub before connecting:

```python
PidFileWatcher("hub.ready").wait()
```

If other services depend on your agent, write a ready file from `initialize()`:

```python
def initialize(self, params):
    write_pid_file("echo.ready")
```

## Environment

Required:

```text
NAME=<agent-name>
```

Optional:

```text
INTERNAL_SECRET=dev-secret
```

`NAME` determines channel names:

```text
IN_CHANNEL  = <NAME>-in
OUT_CHANNEL = <NAME>-out
```

