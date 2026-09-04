const loads=JSON.parse, dumps=JSON.stringify, print=console.log
const CH         = 'llm6',
      CH_OUT     = CH + '-out',
      CH_IN      = CH + '-in',
      DB_IN      =    'dbs6-in',
      STREAM     = true,
      AUTO_RECONNECT = true,
      WS_BASE    = `ws${location.origin.substring(4)}/ws?c=`,
      WS_TIMEOUT =  5 * 1000,
      WS_TIMEOUT2= 15 * 1000
class WsApp {
    constructor(){
	this.uuid = this.conversation = this.lastId = 0
	this.reconnectTimer = null
	this.connectionTimeout = null }
    newTurnId(){
	if (globalThis.crypto && crypto.randomUUID)
	    return crypto.randomUUID()
	return `turn-${Date.now()}-${Math.random().toString(16).slice(2)}` }
    pub(content, role, channel){
	const turn_id = this.newTurnId()
	this.ws.send( channel ||= CH_IN )
	print       ( dumps( { method: 'pub',
			       params: { channel:      channel,
					 role   :      role || 'user',
					 content:      content,
					 uuid   : this.uuid,
					 conversation: this.conversation,
					 turn_id: turn_id,
					 session_id: this.session_id,
					 stream: STREAM } } ) )
	this.ws.send( dumps( { method: 'pub',
			       params: { channel:      channel,
					 role   :      role || 'user',
					 content:      content,
					 uuid   : this.uuid,
					 conversation: this.conversation,
					 turn_id: turn_id,
					 session_id: this.session_id,
					 stream: STREAM } } ) ) }
    resetInactivityTimeout(){
	if (this.inactivityTimeout)
	    clearTimeout(this.inactivityTimeout)
	this.inactiveTimeout = setTimeout(()=>{
	    print("INACTIVE TIMEOUT, just reset the timer...", WS_TIMEOUT2)
	    this.resetInactivityTimeout()
	}, WS_TIMEOUT2) }
    resetConnectionTimeout(){
	this.connectionTimeout = setTimeout(()=>{
	    print("CONNECT TIMEOUT, let's retry")
	    if(this.ws && this.ws.readyState < 2)
		this.ws.close()
	}, WS_TIMEOUT) }
    scheduleReconnect(){
	if(!AUTO_RECONNECT || this.reconnectTimer) return
	this.reconnectTimer = setTimeout(()=>{
	    this.reconnectTimer = null
	    this.connect()
	}, WS_TIMEOUT) }
    connect(){
	const uri = WS_BASE + CH_OUT + '&c=dbs6-out'
	print(`Connecting WebSocket ${uri}...`)
	this.ws = new WebSocket(uri)
	this.resetConnectionTimeout()
	this.ws.onopen    =e=>{	
	    print("WEBSOCKET OPEN", e)
	    document.getElementById('ws-status').textContent = 'Connected'
	    document.getElementById('ws-status').style.color = 'green'
	    //this.resetInactivityTimeout()
	    clearTimeout(this.connectionTimeout)
	    this.connectionTimeout = null }
	this.ws.onmessage =e=>{	
	    const data = loads(e.data)
	    const method = data.method,
		  params = data.params
	    if (method=="initialize")
		this.on_initialize(params)
	    else if (method=="pub")
		this.on_pub(params)
	    else
		alert("BAD METHOD: "+ method)}
	this.ws. onclose  =e=>{
	    print("WEBSOCKET CLOS", e)
	    document.getElementById('ws-status').textContent = 'Disconnected'
	    document.getElementById('ws-status').style.color = 'red'
	    clearTimeout(this.connectionTimeout)
	    this.connectionTimeout = null
	    if(e.code === 1008 || e.reason === 'auth_failed'){
		print("AUTH FAILED, redirecting to login", e)
		location.href = '/login.html'
		return
	    }
	    this.scheduleReconnect()
	}
	this.ws.onerror   =e=>{
	    print("WEBSOCKET ERRR", e)
	    document.getElementById('ws-status').textContent = 'Disconnected'
	    document.getElementById('ws-status').style.color = 'red'
	    clearTimeout(this.connectionTimeout)
	    this.connectionTimeout = null
	}
	return this}}
