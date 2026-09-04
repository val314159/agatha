# Ingress Routing

This document describes how requests reach the local Agatha/AIF and MemoriesDB services. It intentionally stops at the pubsub boundary. Once a request reaches `/ws`, the important runtime behavior is documented in [`agatha-pubsub-internals.md`](./agatha-pubsub-internals.md).

## Purpose

Nginx is the public/front-door router for the local lab stack. It maps browser-visible paths to local services and lets the external `a.ccl.io` machine reach the Newport stack through the autossh setup.

Nginx does **not** define the internal application protocol. It only gets traffic to the right local port.

## Startup Shape

Typical local startup order:

```bash
cd ~/dev/memoriesdb
make

cd ~/dev/aif
make

cd ~/dev/aif/nginx
make

# in the external/relay workflow
make autossh
```

The key assumption is that the machine running nginx can reach the upstream services on `localhost`.

## Service Groups

```text
memoriesdb
  hub   -> HTTP/auth/static + websocket pubsub hub, usually :5002
  dbs6  -> conversation/database command agent
  llm6  -> LLM agent name, implemented by memoriesdb.services.llm8

aif
  web   -> Agatha static frontend/assets, usually :1212
  sup   -> Agatha supervisor/turn coordinator
  vrec  -> voice recognition agent
  aud   -> audio/TTS agent

nginx
  front-door routing for browser-visible paths
```

## Route Map

| Public path | Local upstream | Owner | Purpose |
|---|---:|---|---|
| `/` | `localhost:5002` | `memoriesdb` | Default app/root/auth/static handling |
| `/auth/*` | `localhost:5002` | `memoriesdb` | Login/session/status routes |
| `/ws` | `localhost:5002` | `memoriesdb` | WebSocket pubsub hub |
| `/a/` | `localhost:1212` | `aif` | Agatha frontend |
| `/models/` | `localhost:1212` | `aif` | VRM/FBX/model/static assets |
| `/tts/` | `localhost:9009` | TTS service | TTS HTTP/audio routes |
| `/tts/audiows` | `localhost:9009` | TTS service | TTS websocket audio route |
| `/todo/` | `localhost:8181` | todo/MTD | Todo/workflow UI |
| `/chat/` | `localhost:1234` | chat frontend | Separate chat frontend |
| `/uploads` | `localhost:5012` | app upload/API service | Upload storage/API |
| `/api` | `localhost:5012` or model shim routes | mixed | App API and/or Ollama-compatible model routes |
| `/ollama/...` | `localhost:11434` | Ollama | Local Ollama-compatible API |
| `/opi/...` | `localhost:12434` | OPI/Ollama shim | Alternate model API shim |

## WebSocket Upgrade

The `/ws` route must preserve WebSocket upgrade headers and use long timeouts:

```nginx
location /ws {
    proxy_pass http://localhost:5002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_buffering off;
}
```

After this point, routing is channel-based pubsub and belongs in the internals docs.

## External `a.ccl.io` / autossh Model

There are two valid deployment shapes:

```text
Browser
  -> a.ccl.io
  -> autossh tunnel
  -> Newport nginx
  -> local services
```

or:

```text
Browser
  -> a.ccl.io nginx
  -> autossh-forwarded local ports on a.ccl.io
  -> Newport services
```

The first model is usually simpler: forward one external entrypoint to Newport nginx, then let Newport nginx route to local ports.

## Security Notes

Be careful exposing local model endpoints through public nginx routes. Routes like these can burn GPU time or mutate model state if exposed without authentication:

```text
/ollama/generate
/ollama/chat
/ollama/pull
/ollama/create
/ollama/delete
/opi/chat
/api/chat
```

For public demos, prefer one of:

```nginx
allow <your-ip>;
deny all;
```

or HTTP basic auth, or remove mutation routes entirely.

## Relationship to Pubsub Internals

Ingress gets the browser to `/ws`. From that point on, the real runtime behavior is controlled by:

- hub channel subscriptions
- `method: "pub"` packets
- session-scoped output channels
- `turn_id`
- `session_id`
- `conversation`
- `respond_to`
- `prefill`
- binary/raw audio channels

See [`agatha-pubsub-internals.md`](./agatha-pubsub-internals.md) for the important part.
