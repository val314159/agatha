// Copyable MemoriesDB pub/sub client.
//
// Browser usage:
//   const client = new MemoriesDBPubSub({channels: ['dbs6-out'], reconnect: true})
//   await client.connect()
//   client.publish('dbs6-in', 'listConvos', {uuid: client.uuid})
//
// Node usage with the `ws` package:
//   import WebSocket from 'ws'
//   import { MemoriesDBPubSub } from './pubsub.js'
//   const client = new MemoriesDBPubSub({
//     url: 'ws://localhost:5002/ws',
//     channels: ['dbs6-out'],
//     WebSocketImpl: WebSocket,
//     headers: {'X-Internal-Secret': process.env.INTERNAL_SECRET || 'dev-secret'},
//     reconnect: true
//   })

const loads = JSON.parse
const dumps = JSON.stringify

function defaultWebSocketUrl() {
  if (typeof location !== 'undefined' && location.origin) {
    return `ws${location.origin.slice(4)}/ws`
  }
  return 'ws://localhost:5002/ws'
}

function withChannels(url, channels) {
  const ch = channels || []
  if (!ch.length) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}${ch.map(c => `c=${encodeURIComponent(c)}`).join('&')}`
}

export class MemoriesDBPubSub {
  constructor({
    url = defaultWebSocketUrl(),
    channels = [],
    WebSocketImpl = globalThis.WebSocket,
    headers = undefined,
    stream = true,
    onInitialize = undefined,
    onPub = undefined,
    onClose = undefined,
    onError = undefined,
    reconnect = false,
    reconnectInitialDelay = 1000,
    reconnectMaxDelay = 15000,
    requestTimeout = 15000,
  } = {}) {
    this.url = url
    this.channels = channels
    this.WebSocketImpl = WebSocketImpl
    this.headers = headers
    this.stream = stream
    this.onInitialize = onInitialize
    this.onPub = onPub
    this.onClose = onClose
    this.onError = onError
    this.reconnect = reconnect
    this.reconnectInitialDelay = reconnectInitialDelay
    this.reconnectMaxDelay = reconnectMaxDelay
    this.reconnectDelay = reconnectInitialDelay
    this.requestTimeout = requestTimeout
    this.uuid = null
    this.conversation = null
    this.session_id = null
    this.ws = null
    this.connectPromise = null
    this.reconnectTimer = null
    this.closedByUser = false
    this.pending = new Map()
  }

  newTurnId() {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID()
    return `turn-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  connect() {
    if (this.ws && this.ws.readyState === 1) return Promise.resolve(this)
    if (this.connectPromise) return this.connectPromise

    this.closedByUser = false
    const uri = withChannels(this.url, this.channels)

    // Browser WebSocket accepts (url, protocols), not custom headers.
    // The `ws` Node package accepts (url, options), including headers.
    if (this.headers) {
      this.ws = new this.WebSocketImpl(uri, {headers: this.headers})
    } else {
      this.ws = new this.WebSocketImpl(uri)
    }

    this.connectPromise = new Promise((resolve, reject) => {
      let settled = false

      this.ws.onopen = () => {
        settled = true
        this.connectPromise = null
        this.reconnectDelay = this.reconnectInitialDelay
        resolve(this)
      }

      this.ws.onmessage = event => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = event => {
        const authFailed = event.code === 1008 || event.reason === 'auth_failed'
        this.connectPromise = null
        if (!settled) reject(event)
        this.rejectPending(event)
        if (authFailed) {
          console.warn('MemoriesDB auth failed')
        }
        if (this.onClose) this.onClose(event)
        if (!this.closedByUser && !authFailed) this.scheduleReconnect()
      }

      this.ws.onerror = event => {
        if (!settled) {
          this.connectPromise = null
          reject(event)
        }
        if (this.onError) this.onError(event)
      }
    })

    return this.connectPromise
  }

  handleMessage(raw) {
    const msg = loads(raw)
    const {method, params = {}} = msg

    if (method === 'initialize') {
      this.uuid = params.uuid
      this.conversation = params.conversation
      this.session_id = params.session_id
      if (this.onInitialize) this.onInitialize(params, msg)
      return
    }

    if (method === 'pub') {
      if (this.onPub) this.onPub(params, msg)
      this.resolvePending(params, msg)
      return
    }

    console.warn('Unknown MemoriesDB message', msg)
  }

  scheduleReconnect() {
    if (!this.reconnect || this.reconnectTimer) return

    const delay = this.reconnectDelay
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        await this.connect()
      } catch (error) {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.reconnectMaxDelay)
        if (this.onError) this.onError(error)
        this.scheduleReconnect()
      }
    }, delay)
  }

  publish(channel, content = '', params = {}) {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('MemoriesDB WebSocket is not open')
    }

    const turn_id = params.turn_id || this.newTurnId()
    const payload = {
      method: 'pub',
      params: {
        channel,
        content,
        uuid: params.uuid || this.uuid,
        conversation: params.conversation ?? this.conversation,
        session_id: params.session_id ?? this.session_id,
        role: params.role || 'user',
        turn_id,
        stream: params.stream ?? this.stream,
        ...params,
      },
    }

    // Two-frame publish form used by existing MemoriesDB clients.
    this.ws.send(channel)
    this.ws.send(dumps(payload))
    return turn_id
  }

  request(channel, content = '', params = {}, predicate = undefined) {
    const turn_id = params.turn_id || this.newTurnId()
    const timeoutMs = params.timeout ?? this.requestTimeout

    return new Promise((resolve, reject) => {
      const timeout = timeoutMs
        ? setTimeout(() => {
            this.pending.delete(turn_id)
            reject(new Error(`MemoriesDB request timed out: ${turn_id}`))
          }, timeoutMs)
        : null

      this.pending.set(turn_id, {resolve, reject, predicate, timeout})
      try {
        this.publish(channel, content, {...params, turn_id})
      } catch (error) {
        this.pending.delete(turn_id)
        if (timeout) clearTimeout(timeout)
        reject(error)
      }
    })
  }

  resolvePending(params, msg) {
    const turn_id = params.turn_id
    if (!turn_id || !this.pending.has(turn_id)) return

    const rec = this.pending.get(turn_id)
    if (rec.predicate && !rec.predicate(params, msg)) return

    this.pending.delete(turn_id)
    if (rec.timeout) clearTimeout(rec.timeout)
    rec.resolve(params)
  }

  rejectPending(reason) {
    for (const [turn_id, rec] of this.pending.entries()) {
      if (rec.timeout) clearTimeout(rec.timeout)
      rec.reject(new Error(`MemoriesDB request failed before response: ${turn_id}`, {cause: reason}))
    }
    this.pending.clear()
  }

  close() {
    this.closedByUser = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) this.ws.close()
  }
}

export default MemoriesDBPubSub
