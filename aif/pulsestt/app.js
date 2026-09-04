
const voicerec = new class VoiceRec {
    sttWebSocket;
    audioContext;
    processor;
    globalStream;
    constructor(apikey){
	
    }
    startWebSocket(){
    }
    async startStreaming(){
    }
    stopStreaming(){
    }
};

function convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l--) {
        buf[l] = Math.min(1, buffer[l]) * 0x7FFF;
    }
    return buf.buffer; // Return the underlying ArrayBuffer
}

let ws;

let audioContext;
let processor;
let globalStream;

function startWebSocket() {
    const K1 = 'bfda89bea79b4ba7';
    const K2 = '8d744dcfc2e45457';
    const url = new URL("wss://waves-api.smallest.ai/"+
			"api/v1/pulse/get_text");
    url.searchParams.append("full_transcript", "true");
    url.searchParams.append("word_timestamps", "true");
    url.searchParams.append("sentence_timestamps", "true");
    url.searchParams.append("language", "en");
    url.searchParams.append("encoding", "linear16");
    url.searchParams.append("sample_rate", "16000");
    url.searchParams.append("api_key", `sk_${K1+K2}`);
    url.searchParams.append("inactivity_timeout", "60");
    const wsUrl = url.toString();
    console.log("WSURL", wsUrl);
    ws = new WebSocket(wsUrl);
    //const ws = new WebSocket(url.toString(), {
    //    headers: { Authorization: `Bearer ${API_KEY}` }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
	console.log("Connected! Start streaming audio chunks now.");
	startStreaming()
    };
    ws.onmessage = (event) => {
	const data = JSON.parse(event.data);
	console.log(data)
	if(data.is_final)
	    console.log("Final:", data.transcript);
	else
	    console.log("Part::", data.transcript);
    };
    ws.onerror = (error) => {
	console.error("WebSocket Error:", error);
    };
    ws.onclose = (error) => {
	console.error("WebSocket Close:", error);
	getWebSocket();
    };
}

async function startStreaming() {
    globalStream = await navigator.mediaDevices.getUserMedia({audio:true});
    audioContext = new AudioContext({sampleRate:16000});
    const source = audioContext.createMediaStreamSource(globalStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = e => (
	ws.readyState === WebSocket.OPEN &&
	    ws.send(convertFloat32ToInt16(
		e.inputBuffer.getChannelData(0))));
    source.connect(processor);
    processor.connect(audioContext.destination);
}

function stopStreaming() {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "finalize" })); // Required End Signal
    }
    globalStream.getTracks().forEach(track => track.stop());
    processor.disconnect();
    audioContext.close();
}

startWebSocket();
