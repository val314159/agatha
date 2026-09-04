export class PubSubApp {
  BASE_URL = null;
  BASE_URL0 = null;
  BASE_URL1 = null;
  IN_CH = null;
  OUT_CH = null;
  OUT_CH2 = null;
  OUT_CH3 = null;
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimeoutId = null;
    this.pingIntervalId = null;
    console.log("PubSubApp constructor");
  }
  incomingMessage(_msg) {
    throw new Error("incomingMessage() must be implemented by subclass");
  }
  incomingBinary(_msg) {
    throw new Error("incomingBinary() must be implemented by subclass");
  }
  onWsOpen(_event) {}
  onWsInit(_params) {}
  onWsClose(_event) {}
  onWsError(_event) {}
  getWsUrl() {
    console.log("Connecting to", this.BASE_URL, ". . .");
    if (this.OUT_CH3) {
      return (
        this.BASE_URL +
        `/ws?c=${this.OUT_CH}&c=${this.OUT_CH2}&c=${this.OUT_CH3}&c=qaz2`
      );
    } else if (this.OUT_CH2) {
      return this.BASE_URL + `/ws?c=${this.OUT_CH}&c=${this.OUT_CH2}&c=qaz2`;
    } else {
      return this.BASE_URL + `/ws?c=${this.OUT_CH}&c=qaz1`;
    }
  }
  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("WS NOT OPEN", msg);
    }
  }
  sendRaw(channel, content) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(channel);
      this.ws.send(content);
    } else {
      let preview = content;
      if (content instanceof ArrayBuffer) {
        preview = `[ArrayBuffer ${content.byteLength} bytes]`;
      } else if (ArrayBuffer.isView(content)) {
        preview = `[${content.constructor.name} ${content.byteLength} bytes]`;
      } else if (typeof content === "string") {
        preview = content.slice(0, 60);
      } else {
        preview = String(content).slice(0, 60);
      }
      console.warn("WS NOT OPEN FOR RAW SEND", { channel, content: preview });
    }
  }
  pub(params, channel = this.IN_CH) {
    this.send({ method: "pub", params: { channel, ...params } });
  }
  pub2(params, channel) {
    this.ws.send(channel);
    this.send({ method: "pub", params: { channel, ...params } });
  }
  pubRaw(channel, content) {
    this.sendRaw(channel, content);
  }
  startPingLoop() {
    this.stopPingLoop();
    this.pingIntervalId = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.pub({ timestamp: Date.now() }, "ping");
      }
    }, 15000);
  }
  stopPingLoop() {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
  scheduleReconnect() {
    if (this.reconnectTimeoutId) {
      return;
    }
    const attempt = this.reconnectAttempts || 0;
    const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.log("Scheduling reconnect in", delay, "ms");
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.reconnectAttempts = attempt + 1;
      this.connect();
    }, delay);
  }
  clearReconnectTimer() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }
  connect() {
    this.stopPingLoop();
    const wsUrl = this.getWsUrl();
    console.log("Connecting to", wsUrl, ". . .");
    window.setWsStatus("yellow");
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    ws.onerror = (e) => {
      console.log("WS EROR", e);
      this.debug?.('[PubSubApp] WS error');
      window.setWsStatus("red");
      this.onWsError(e);
      this.stopPingLoop();
      this.scheduleReconnect();
    };
    ws.onclose = (e) => {
      console.log("WS CLOS", e, "code:", e.code, "reason:", e.reason);
      this.debug?.('[PubSubApp] WS closed', { code: e.code, reason: e.reason || '' });
      window.setWsStatus("red");
      this.onWsClose(e);
      this.stopPingLoop();
      if (e.reason === "auth_failed") {
        window.location.href = "/login.html";
      } else {
        this.scheduleReconnect();
      }
    };
    ws.onopen = (e) => {
      console.log("WS OPEN", e);
      this.debug?.('[PubSubApp] WS open');
      window.setWsStatus("green");
      this.startPingLoop();
      this.reconnectAttempts = 0;
      this.clearReconnectTimer();
      this.onWsOpen(e);
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        //console.log("WS MESG", e);
        const msg = JSON.parse(e.data);
        if (msg && msg.method === "initialize") {
          this.onWsInit(msg.params);
        }
        this.incomingMessage(msg);
      } else {
        this.incomingBinary(e.data);
      }
    };
    this.ws = ws;
  }
  disconnect() {
    console.log("disconnect");
    this.stopPingLoop();
    this.clearReconnectTimer();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        console.warn("Error during manual disconnect", e);
      }
    }
  }
}
