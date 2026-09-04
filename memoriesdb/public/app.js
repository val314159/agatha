const GEBI = x=>document.getElementById(x)
const app = (new class App extends WsApp {

    // MISC STATIC FUNCS

    displayText(s){
	print(s)
	GEBI("display").prepend(document.createTextNode(s))
	GEBI("display").prepend(document.createElement('br'))}

    top(){window.scrollTo(0, 0)}
    bot(){window.scrollTo(0, document.body.scrollHeight)}

    textNode(s){return document.createTextNode(s)}

    createElt(tag, html, id){
	if(!tag) return
	const elt = document.createElement(tag)
	elt.id = id
	elt.innerHTML = tag + ': ' + html
	return elt}

    // ACTION FUNCS

    listConvos(){
	this.displayText("LIST CONVOS: " + this.uuid)
	this.displayText("PUBLISH A MESSAGE TO A MICROSERVICE?")
	this.pub('listConvos', 'user', DB_IN)}

    newConvo(){
	this.displayText("NEW CONVO: " + this.uuid)
	this.displayText("PUBLISH A MESSAGE TO A MICROSERVICE?")
	this.pub('newConvo', 'user', DB_IN)}

    deleteConvo(convoId){
	this.displayText("DELETE CONVO: " + convoId)
	this.displayText("PUBLISH A MESSAGE TO A MICROSERVICE?")
	this.pub('delConvo', 'user', DB_IN, {conversation_id: convoId})}

    deleteCurrentConvo(){
	if(!this.conversation){
	    alert('No conversation selected to delete')
	    return
	}
	if(confirm('Are you sure you want to delete this conversation? This action cannot be undone.')){
	    this.deleteConvo(this.conversation)
	}}

    // prepend / apppend funcs

    prependMsg(role, content, id){
	const elt = this.createElt(role, content, id)
	if (elt) GEBI("display").prepend(elt)}

    appendMsg(role, content, id){
	const elt = this.createElt(role, content, id)
	if (elt) GEBI("display").append(elt)}
    
    appendMessage(params){
	const id = ++this.lastId
	this.prependMsg(params.role, params.content)
	this.prependMsg(  "thinking", '',  'thinking-'+id )
	this.prependMsg( "assistant", '', 'assistant-'+id )
    }

    appendThoughts(s){
	GEBI( "thinking-"+this.lastId).append(this.textNode(s))}

    appendContents(s){
	GEBI("assistant-"+this.lastId).append(this.textNode(s))}

    clearDisplay(){
	GEBI("display").innerHTML = ''}

    setConversationReady(ready){
	const input = GEBI("input")
	if(!input) return
	input.disabled = !ready
	if(ready){
	    input.placeholder = "Type Input Here..."
	    input.style.backgroundColor = ''
	    input.style.borderColor = ''
	    input.style.color = ''
	    return
	}
	input.placeholder = "No conversation selected. Click New Conversation."
	input.style.backgroundColor = '#ffe4ec'
	input.style.borderColor = '#e11d48'
	input.style.color = '#9f1239'
    }

    showNoConversationMessage(){
	this.clearDisplay()
	const elt = document.createElement('div')
	elt.innerHTML = 'No conversation selected. Click <b>New Conversation</b> to start chatting.'
	elt.style.padding = '12px'
	elt.style.margin = '8px 0'
	elt.style.border = '1px solid #e11d48'
	elt.style.background = '#ffe4ec'
	elt.style.color = '#9f1239'
	GEBI("display").prepend(elt)
	this.bot()
    }

    // callbacks
    
    on_initialize(params){ 
	const sp = new URLSearchParams(location.search)
	const authStatus = globalThis.__authStatus || this.authStatus || {}
	this.uuid    = sp.get('uuid'   ) || params['uuid'] || authStatus.user_id
	this.conversation = sp.get('conversation') || params['conversation'] || params['conversation_id'] || authStatus.conversation_id
	this.session_id = params['session_id']
	console.log('INIT payload', params)
	print(`INITIALIZE ${this.uuid} ${this.conversation} ${this.session_id}`)
	if(!this.conversation){
	    this.setConversationReady(false)
	    this.showNoConversationMessage()
	    return
	}
	this.setConversationReady(true)
	//this.displayText(`INITIALIZE ${this.uuid} ${this.conversation}`)
	//this.displayText("REQUEST HISTORY")
	//this.bot()
	this.pub('shortHistory', this.role, DB_IN)}
    
    on_pub(params){
	const channel = params.channel
	if      (channel.startsWith('dbs6-')) _.on_dbs_message(params)
	else if (channel.startsWith('llm6-')) _.on_llm_message(params)
	else                                print(">>PUB ERR", params)}

    on_dbs_message(params){
	print(">>DBS", params)
	const key = 'dbs_'+params.content
	print(">>KEY", key)
	const fn = this['dbs_'+params.content]
	print(">>FN", fn)
	if(fn)
	    return fn.bind(this)(params)
	print('WARNING, NOT FOUND ' + dumps(params))}
    
    on_llm_message(params){
	print(">>LLM", params)
	var used = false;
	if(params.thinking){
	    used = true
	    this.llm_thinking(params)}
	if(params.content){
	    used = true
	    this.llm_speaking(params)}
	if(params.done){
	    used = true
	    this.llm_finished(params)}
	if(!used)
	    print('WARNING, NOT USED ' + dumps(params))
	return this.bot()}

    llm_thinking(params){
	this.appendThoughts(params.thinking)}

    llm_speaking(params){
	if(params.role=='user' || params.role=='system'){
	    this.appendMessage(params)
	}else if(params.role=='assistant'){
	    this.appendContents(params.content)
	}else
	    print("WARNING: WHATS THE ROLE HERE:", params)}

    llm_finished(params){
	GEBI("input").focus()}

    dbs_listConvos(params){
	print("LIST", _.uuid, params.results)
	params.results.forEach(x=>{
	    print("X", x[0], " - ", x[1], '!')
	    const html = `<a href=.?conversation=${x[0]}>${x[1]}</a>`
	    GEBI("display").prepend(this.createElt("li", html))
	    this.bot()
	})}

    dbs_shortHistory(params){
	print("SHIST", _.uuid, params.results)
	this.clearDisplay()
	var lastRole = ''
	var buffer = []
	params.results.forEach(x=>{
	    if(lastRole != x.role){
		this.appendMsg(lastRole, buffer.join(''))
		
		lastRole = x.role
		buffer.length = 0
	    }
	    buffer.unshift(x.content)
	})
	this.appendMsg(lastRole, buffer.join(''))
	this.bot()
    }

    dbs_newConvo(params){
	print("NEWC", _.uuid, params.results)
    	setTimeout(()=>{
	    location = '.'
	    print("1REFRESH WITH THE NEW CONVO", _.uuid, params.results)
	    setTimeout(()=>{
		print("2REFRESH WITH THE NEW CONVO", _.uuid, params.results)
		location = '.'
		print("2REFRESH WITH THE NEW CONVO", _.uuid, params.results)
	    },1000)
	},1500)}

    keypress(e){
	if(e.key=='Enter' && !e.shiftKey && !e.ctrlKey){
	    e.preventDefault()
	    const input = e.target.value.trim()
	    e.target.value = ''
	    e.target.blur()
	    if(!input)return
	    console.log("INPUT "+input)
	    this.pub(input, this.role)
	    return this.bot()}}

    documentKeypress(event){
	if(event.key=='\\' && event.ctrlKey){
	    event.preventDefault()
	    print("^BRK", event.target)
	    GEBI("input").focus()
	    return this.bot()}}

    install(){
	const inputElt = GEBI("input")
	const role_Elt = GEBI("role")
	inputElt.addEventListener('keypress', e=>this.keypress(e))
	document.addEventListener('keypress', e=>this.documentKeypress(e))
	role_Elt.addEventListener('change',   e=>this.role=e.target.value)
	this.role = role_Elt.value
	return this}

} ).install()
const sys  = (content, channel)=> app.pub(content, 'system')
const user = (content, channel)=> app.pub(content)
const ls   = ()=>app.listConvos()
const newc = ()=>app.newConvo()
const go_top=()=>app.top()
const go_bot=()=>app.bot()
window._ = app
window.app = app
