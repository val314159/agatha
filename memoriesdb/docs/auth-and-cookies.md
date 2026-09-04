# Auth And Cookies

MemoriesDB supports two WebSocket authentication modes:

- Browser clients authenticate with the `session` cookie.
- Internal agents authenticate with the `X-Internal-Secret` header.

Use cookies for browser UI code. Use `X-Internal-Secret` for local trusted
agent processes and service workers.

## Browser Login Flow

Browser login uses HTTP endpoints on the hub:

```text
POST /auth/register
POST /auth/login
GET  /auth/status
POST /auth/logout
```

`/auth/login` expects:

```json
{
  "email": "user@example.com",
  "digest": "sha256 hex digest of password"
}
```

On success, the hub sets:

```text
device_id  HttpOnly; SameSite=Lax
session    HttpOnly; SameSite=Lax
```

Browser JavaScript does not read the `session` cookie directly. The browser
sends it automatically on same-origin HTTP and WebSocket requests.

## Check Login State

```js
const response = await fetch('/auth/status')
const status = await response.json()

if (!status.logged_in) {
  location.href = '/login.html'
}
```

Successful status includes:

```json
{
  "logged_in": true,
  "user_id": "uuid",
  "email": "user@example.com",
  "conversation_id": "uuid or null",
  "device_id": "device cookie value"
}
```

## Browser WebSocket Auth

Use a same-origin WebSocket URL:

```js
const ws = new WebSocket(`ws${location.origin.slice(4)}/ws?c=dbs6-out`)
```

The browser includes the `session` cookie automatically. If the session is
missing or expired, the hub closes with:

```text
code: 1008
reason: auth_failed
```

Handle that by redirecting to login:

```js
ws.onclose = event => {
  if (event.code === 1008 || event.reason === 'auth_failed') {
    location.href = '/login.html'
  }
}
```

## Internal Agent Auth

Trusted local agents can bypass browser cookies with:

```text
X-Internal-Secret: <INTERNAL_SECRET>
```

The development default is:

```text
dev-secret
```

Do not put `X-Internal-Secret` in browser code. Browser WebSocket APIs do not
allow custom headers, and the secret should not be exposed to users.

Python example:

```python
import os
import websocket

ws = websocket.WebSocket()
ws.connect(
    "ws://localhost:5002/ws?c=dbs6-out",
    header=[f"X-Internal-Secret: {os.getenv('INTERNAL_SECRET', 'dev-secret')}"],
)
```

## Copyable JS Client

See [examples/pubsub.js](examples/pubsub.js).

The helper supports opt-in reconnect:

```js
const client = new MemoriesDBPubSub({
  channels: ['dbs6-out'],
  reconnect: true,
  reconnectInitialDelay: 1000,
  reconnectMaxDelay: 15000
})
```

Reconnect behavior:

- no reconnect after manual `client.close()`
- no reconnect after auth failure (`1008` or `auth_failed`)
- retry delay starts at 1 second
- failed reconnect attempts back off to 2s, 4s, 8s, then max 15s
- successful reconnect resets the delay to 1 second
- in-flight `request()` promises are rejected when the socket closes

Use `request()` for command/response flows that echo `turn_id`:

```js
const response = await client.request('dbs6-in', 'listConvos', {
  uuid: client.uuid,
  timeout: 15000
})
```

Use `publish()` for fire-and-forget messages:

```js
client.publish('llm6-in', 'hello', {
  uuid: client.uuid,
  conversation: client.conversation
})
```
