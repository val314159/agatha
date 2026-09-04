import { UrlParams } from './urlParams.js'
import { MessageHistory } from './messageHistory.js'
import { SceneRenderer } from './sceneRenderer.js'
import { Blinker } from './blinker.js'
import { LipSyncState } from './lipSyncState.js'
import { VoiceRecog } from './voiceRecog.js'
import { ShellModal } from './shellModal.js'
import { UI } from './ui.js'
import { animate } from './animate.js'
import { PubSubApp } from './pubSubApp.js'
import { AudioPlayer } from './audio_player.js'
import { decodePcm16leToFloat32 } from './decode_pcm.js'
import { uuidv7 } from './uuidv7.js'
import { DanceFrameSystem } from './danceFormat.js'
import { TurnMachine } from './turnmachine.js'

export class Application extends PubSubApp {
	BASE_URL0 = location.hostname === 'localhost' ? 'http://localhost:5002' : location.origin
    BASE_URL1 = location.hostname === 'localhost' ? 'http://localhost:1212' : location.origin
    BASE_URL  = location.hostname === 'localhost' ? 'http://localhost:5002' : location.origin
	
    IN_CH  = 'sup-in'
    OUT_CH = 'sup-out'
    OUT_CH2 = 'aud-out-bin'
    OUT_CH3 = 'aud-out-ctl'
    VREC_CH = 'vrec-in::'
	
    // Treat chunks as silent if their peak amplitude is below this.
    // 0.001 ≈ int16 value ~33 (33 / 32768).
    SILENCE_THRESHOLD = 0.001;
    hasEnergy(floatChunk, ampThreshold = this.SILENCE_THRESHOLD) {
		if (!floatChunk || !floatChunk.length) return false;
		let maxAbs = 0;
		for (let i = 0; i < floatChunk.length; i++) {
			const v = Math.abs(floatChunk[i]);
			if (v > maxAbs) maxAbs = v;
			if (maxAbs >= ampThreshold) {
				return true;               // definitely not silent
			}
		}
		return false;                      // all samples very close to 0
	}
	pubRawAudio(data){
		this.pubRaw(this.VREC_CH, data)
	}
	_nowIso() {
		return new Date().toISOString();
	}
    debug(message, details = null) {
		if (details) {
			console.log(message, details);
		} else {
			console.log(message);
		}

		if (!this.ui?.addDebugEvent) {
			return;
		}

		let suffix = '';
		if (details) {
			try {
				suffix = ` ${JSON.stringify(details)}`;
			} catch (_err) {
				suffix = ' [details]';
			}
		}
		this.ui.addDebugEvent(`${message}${suffix}`);
	}
	setRuntimeState(patch = {}) {
		this.runtimeState = {
			...(this.runtimeState || {}),
			...patch,
		};
		this.ui?.updateRuntimeState?.(this.runtimeState);
	}
	syncConvoModeToServer(reason = 'sync') {
		if (!this.session_id) {
			this.debug('[Application] Skipping convo_mode sync without session_id', { reason });
			return;
		}
		this.debug('[Application] Syncing convo_mode to server', {
			mode: this.convoMode,
			reason,
		});
		this.voiceRec.sendConvoModeUpdate(this.convoMode);
	}
	incomingBinary(data) {
		if (
			this.canceledAssistantTurnId &&
			this.activeAssistantTurnId &&
			this.canceledAssistantTurnId === this.activeAssistantTurnId
		) {
			console.log('[Application] Dropping audio for canceled turn', this.activeAssistantTurnId);
			return;
		}
		try {
			const floatChunk = decodePcm16leToFloat32(data);
			// Skip chunks that are essentially 0 / -1 / -2 etc.
			if (!this.hasEnergy(floatChunk)) {
				return;
			}
			this.setRuntimeState({ audio: 'audio-playing' });
			this.pcmPlayer.scheduleChunk(floatChunk);
		} catch (err) {
			console.error('PCM decode failed', err);
		}
	}
    incomingMessage(msg){
//		console.log("[Application] incomingMessage", msg)
		const method=msg.method
		const params=msg.params
		if(method=="pub"){
			if(params.type=="audio"){
				this.setRuntimeState({ audio: 'audio-generating' });
				this.generateAudio(params.url)
			}else if(params.type=="audio_pcm"){
				if (params.content === 'start-audio') {
					this.setRuntimeState({ audio: 'audio-playing' });
					this.activeAssistantTurnId = params.turn_id || null;
					if (this.canceledAssistantTurnId !== this.activeAssistantTurnId) {
						this.canceledAssistantTurnId = null;
					}
				} else if (params.content === 'finish-audio') {
					this.setRuntimeState({
						audio: this.runtimeState?.audio === 'audio-playing' ? 'audio-draining' : 'done',
					});
					if (!params.turn_id || params.turn_id === this.activeAssistantTurnId) {
						this.activeAssistantTurnId = null;
					}
					if (params.turn_id && params.turn_id === this.canceledAssistantTurnId) {
						this.canceledAssistantTurnId = null;
					}
				}
				return;
			}else if(params.type=="start"){
				this.setRuntimeState({ backend: 'turn-started' });
				this.debug('[Application] Backend turn started', {
					turn_id: params.turn_id || null,
				});
			}else if(params.type=="end"){
				this.setRuntimeState({
					backend: 'turn-ended',
					audio: this.runtimeState?.audio === 'audio-playing' ? 'audio-playing' : 'done',
				});
				this.debug('[Application] Backend turn ended', {
					turn_id: params.turn_id || null,
				});
				if (
					this.turnMachine?.mode === 'PUSH_TO_TALK' &&
					this.runtimeState?.audio !== 'audio-playing' &&
					this.runtimeState?.audio !== 'audio-draining'
				) {
					this.turnMachine.forceWaitingForUser?.('backend_end');
				}
			}else if(params.expression){
				console.log("QUEUED EXPRESSION:", params.expression, "at time:", params.time_ms, "ms");
				this.pendingAvatarUpdates.push({
					type: 'expression',
					value: params.expression,
					targetTime: params.time_ms || 0
				});
			}else if(params.animation){
				console.log("QUEUED ANIMATION:", params.animation, "at time:", params.time_ms, "ms");
				// Map animation names to URLs
				const animationMap = {
					'dance-rumba': '/models/Rumba Dancing.fbx',
					'wave': '/models/Salute.fbx',
					'nod': '/models/Salute.fbx',
					'jump': '/models/Rumba Dancing.fbx',
					'sit': '/models/Texting While Standing.fbx',
					'stand': '/models/Texting While Standing.fbx',
					'walk': '/models/Rumba Dancing.fbx',
					'run': '/models/Rumba Dancing.fbx',
					'thumbs-up': '/models/Salute.fbx',
					'shrug': '/models/Texting While Standing.fbx',
					'shake-head': '/models/Rumba Dancing.fbx'
				};
				const animationUrl = animationMap[params.animation];
				if (animationUrl) {
					// Queue animation for later processing
					this.pendingAvatarUpdates.push({
						type: 'animation',
						value: params.animation,
						animationUrl: animationUrl,
						targetTime: params.time_ms || 0
					});
				}
			}else if(params.content){
				if (params.role === 'assistant') {
					this.setRuntimeState({
						backend: params.done ? 'assistant-done' : 'llm-streaming',
					});
				}
				const content = params.content
//				console.log("VALID-CONTENT", typeof(content), content, role)
				if (typeof content === 'string') {
					if (
						params.role === 'assistant' &&
						content.trim() &&
						params.done !== false
					) {
						this.messageHistory.add(content, false);
					}
//					console.log("CONTENT IS STRING", content, typeof content);
				} else {
//					console.warn("CONTENT IS NOT STRING", content, typeof content);
					if(Array.isArray(content)) {
						this.phonemeList = content;
					} else {
						console.warn("CONTENT IS UNKNOWN TYPE", typeof content, content);
					}
				}
			}else{
				const role = params.role
				console.warn("INVALID PUB>>>>", JSON.stringify(msg.params), role)
			}
		} else if(msg.method=="initialize"){
			this.params = msg.params;
			console.log("VALID INIT", this.params)
			
			const urlParams = new URLSearchParams(window.location.search);
			const conversation = urlParams.get('conversation');

			this.uuid = this.params.uuid
			this.session_id = this.params.session_id
			this.conversation = conversation || this.params.conversation
			
			const authGate = document.getElementById('auth-gate')
			if(authGate){
				authGate.style.display = 'none'
			}
			this.syncConvoModeToServer('initialize');
		} else {
			console.warn("NOT VALID", msg)
		}
    }
    talkToAvatar(message){
		console.log("[Application] talkToAvatar", message)
		this.turnId = uuidv7();
		this.pub({
			role: 'user',
			content: message,
			uuid: this.uuid,
			session_id: this.session_id,
			conversation: this.conversation,
			turn_id: this.turnId,
			generate_audio: true,
			stream: false
		})
    }
    constructor() { //ctor
		console.log("[Application] constructor")
        super();

		this.pttGracePeriod = 150; // ms
		this.pttGraceTimer = null;
		this.convoMode = 'active';
		this.prePttConvoMode = null;
		this.pttActiveRestoreTimer = null;
		this.runtimeState = {
			ptt: 'up',
			voice: 'idle',
			backend: 'idle',
			audio: 'idle',
			turn: 'none',
			convo: this.convoMode,
		};

		this.turnMachine = new TurnMachine(this);
		this.turnMachine.setMode('PUSH_TO_TALK');
		
		this.phonemeList = [];
		this.pcmPlayer = new AudioPlayer({
			onStart: () => {
				this.setRuntimeState({ audio: 'audio-playing' });
				this.lipSync.onstart();
				this.turnMachine.handle({ type: 'SPEAKING_STARTED' });
			},
			onEnd:   () => {
				this.setRuntimeState({ audio: 'done' });
				this.lipSync.onend();
				this.turnMachine.handle({ type: 'SPEAKING_FINISHED' });
				if (this.runtimeState?.backend === 'turn-ended') {
					this.turnMachine.forceWaitingForUser?.('audio_end_after_backend_end');
				}
			},
		});
		this.lipSync = new LipSyncState();
		this.blinker = new Blinker();
		this.voiceRec = new VoiceRecog({
			app: this,
		});
		// Queue for pending avatar updates (expressions/animations)
		this.pendingAvatarUpdates = []		
		
		this.sceneRenderer = null;

		this.messageHistory = new MessageHistory();
		this.shellModal = new ShellModal();
		this.ui = new UI(this);
		this.danceFrameSystem = null;  // Will be initialized after VRM loads

		this.queueAudioPlayback = false;
		this.audioQueue = [];
		this.activeAssistantTurnId = null;
		this.canceledAssistantTurnId = null;

		this.connect();

//		document.body.onload = () => this.init();
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => this.init());
} else {
	this.init();
}
    }
	init() {
		console.log("[Application] init")
		this.ui.init();
		this.shellModal.init();
		this.messageHistory.load();
		this.applyUrlParameters();
		const container = document.getElementById('avatar-container');
		this.sceneRenderer = new SceneRenderer(container);
		this.sceneRenderer.loadVRMModel(this, UrlParams.getInitialAvatarModelPath());
		this.voiceRec.activate().catch((error) => {
			this.debug('[Application] Voice activation failed', {
				error: error?.message || String(error),
			});
		});
		animate(this);
	}
	applyUrlParameters() {
		const layout = UrlParams.getQueryParam('layout')?.toLowerCase();
		if (layout)
			if(layout === 'portrait' || layout === 'landscape')
				this.ui.setLayout(layout);
			else
				console.warn("Invalid layout parameter:", layout);
	}

	// convo mode stuff

	setConvoMode(mode) {
		this.prePttConvoMode = null;
		this._setConvoMode(mode);
	}
	_setConvoMode(mode) {
        if (!['sleep', 'idle', 'active'].includes(mode)) {
            console.warn('[Application] Invalid convo_mode:', mode);
            return;
        }
        this.convoMode = mode;
		this.setRuntimeState({ convo: mode });
        this.debug('[Application] Setting convo_mode', {
            mode,
            at: this._nowIso(),
        });
        this.ui?.updateConvoModeIndicator(mode);
		this.voiceRec.sendConvoModeUpdate(mode);
    }
	onWsOpen(_event) {
		if (!this.session_id) {
			return;
		}
		this.syncConvoModeToServer('ws_open');
	}
	_promoteToActiveForPtt() {
		if (this.convoMode === 'active') {
			return;
		}
		this.prePttConvoMode = this.convoMode;
		this.debug('[Application] Promoting convo_mode to active for PTT', {
			from: this.prePttConvoMode,
			at: this._nowIso(),
		});
		this._setConvoMode('active');
	}

	// actions

	pttButtonDown(){
		this.setRuntimeState({ ptt: 'down', backend: 'idle', audio: 'idle' });
		this.debug('[Application] PTT button pressed');
		this._promoteToActiveForPtt();
		this.turnMachine.handle({ type: 'PTT_BUTTON_DOWN' });
	}
	pttButtonUp(){
		this.setRuntimeState({ ptt: 'up' });
		this.debug('[Application] PTT button released');
		this.turnMachine.handle({ type: 'PTT_BUTTON_UP' });
		// Immediately restore to previous mode instead of grace period
		if (this.prePttConvoMode && this.convoMode === 'active') {
			this.debug('[Application] Restoring convo_mode immediately on PTT release', {
				to: this.prePttConvoMode,
				at: this._nowIso(),
			});
			const restoreMode = this.prePttConvoMode;
			this.prePttConvoMode = null;
			this._setConvoMode(restoreMode);
		}
	}

	_startAudio(){
		console.log("[Application] startAudio: starting audio")
		this.pcmPlayer.reset();
		this.lipSync.onstart();
		this.turnMachine.handle({ type: 'SPEAKING_STARTED' });
	}	
	_finishAudio(){
		console.log("[Application] finishAudio: stopping current audio / clearing queue")
		this.pcmPlayer.reset();
		this.lipSync.onend();
		this.audioQueue = [];
		this.turnMachine.handle({ type: 'SPEAKING_FINISHED' });
	}
	

	// commands

	executeCommand(command) {
		switch(command.type){
			case 'start_capturing':
				this.voiceRec.startStreaming();
				break;
			case 'stop_capturing':
				this.voiceRec.stopStreaming();
				break;
			case 'start_speaking':
//				this._startAudio();
				break;
			case 'stop_speaking':
//				this._finishAudio();
				break;
			case 'wait_for_user':
				console.log("[Application] wait_for_user: waiting for user")
				break;
			case 'wait_for_assistant':
				console.log("[Application] wait_for_assistant: waiting for assistant")
				break;
			case 'cancel_turn':
				console.log("[Application] cancel_turn: canceling turn")
				this.canceledAssistantTurnId = this.activeAssistantTurnId;
				this._finishAudio();
				break;
			case 'end_turn':
				console.log("[Application] end_turn: ending turn")
				break;
			default:
				console.warn('Unknown command type:', command.type);
		}
	}
}
