import { getAecMicrophoneStream } from './aec.js';

// TODO: add a way to flag a preroll duration, and publish that chunk before the main stream starts
// TODO: add a way to flag a postroll duration, and publish that chunk after the main stream stops

// TODO: add ring buffer size 8, decrease buffersize of 2048 (128ms),
//        then ship first 8 packets unbuffered, the buffer 1s of audio after that

// TODO: filter out silence and send only when audio is detected (prefixed by a timestamp)
//       also, it would be nice to maybe keep small pauses in, just filter out large pauses

function convertFloat32ToInt16(buffer, inPlace) {
    let i = buffer.length;
    const out = inPlace || new Int16Array(i);
    while (i--) {
        out[i] = Math.min(1, Math.max(-1, buffer[i])) * 0x7fff;
    }
    return out.buffer;
}

export class VoiceRecog {
    constructor({
        app = null,
        sampleRate = 16000,
        bufferSize = 4096,
    } = {}) {
        this.app = app;
        this.sampleRate = sampleRate;
        this.bufferSize = bufferSize;

        this.audioContext = null;
        this.processor = null;
        this.globalStream = null;
        this.silentSink = null;
        
        this.lastChunk = new Int16Array(this.bufferSize);

        this.prerollDuration = 0; // <= (bufferSize * sampleRate / 1000)
        this.postrollDuration = 0;

        this.isStreaming = false;
        this.isMuted = false;

        this.isPostRolling = false;
    }

    _shouldSendAudio() {
        return this.isStreaming || this.app.convoMode !== 'active';
    }

    sendConvoModeUpdate(mode) {
        if (!['sleep', 'idle', 'active'].includes(mode)) {
            console.warn('[VoiceRecog] Invalid convo_mode:', mode);
            return;
        }
        this.app.debug('[VoiceRecog] Sending control', {
            event: 'set_convo_mode',
            mode,
        });
        console.log('[VoiceRecog] Sending convo_mode update', mode);
        // Send the mode to the backend
        this.app.pubRawAudio(JSON.stringify({
            type: 'voice_recog_control',
            event: 'set_convo_mode',
            mode: mode,
            uuid: this.app.uuid,
            session_id: this.app.session_id,
            conversation: this.app.conversation,
        }));
    }

    _onaudioprocess(event) {
        try {
            // buffer the last 256ms chunk
            convertFloat32ToInt16(event.inputBuffer.getChannelData(0), this.lastChunk);
            if (this.isMuted) {
                // do nothing, we're muted
            } else if (this._shouldSendAudio()) {
                this.app.pubRawAudio(this.lastChunk.buffer);
            } else if (this.isPostRolling) {
                this.app.setRuntimeState?.({ voice: 'postroll' });
                this.app.pubRawAudio(this.lastChunk.buffer);
                this._sendFinalizeSTTMessage();
                this.isPostRolling = false;
            }
        } catch (error) {
            console.error('[VoiceRecog] Error', error);
        }
    }
        
    async activate() {
        if (this.processor) {
            console.warn('[VoiceRecog] Already streaming');
            return;
        }

        try {
            this.globalStream = await getAecMicrophoneStream(this.sampleRate);
            this.audioContext = new AudioContext({ sampleRate: this.sampleRate });

            const source = this.audioContext.createMediaStreamSource(this.globalStream);
            this.processor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
            this.silentSink = this.audioContext.createGain();
            this.silentSink.gain.value = 0;
            this.processor.onaudioprocess = (event) => this._onaudioprocess(event);

            source.connect(this.processor);
            this.processor.connect(this.silentSink);
            this.silentSink.connect(this.audioContext.destination);

            this.lastChunk.fill(0); // set initial silence

            console.log('[VoiceRecog] Streaming microphone audio with AEC constraints and silent sink');
            this.app.setRuntimeState?.({ voice: 'idle' });
        } catch (error) {
            console.error('[VoiceRecog] Failed to activate microphone', error);
            this.app.setRuntimeState?.({ voice: 'error' });
            this.deactivate();
            throw error;
        }
    }

    deactivate() {
        if (this.processor) {
            console.log('[VoiceRecog] Stopping streaming');
            this.processor.disconnect();
            this.processor.onaudioprocess = null;
            this.processor = null;
        } else
            console.warn('[VoiceRecog] No processor to stop');

        if (this.silentSink) {
            this.silentSink.disconnect();
            this.silentSink = null;
        }

        if (this.globalStream) {
            this.globalStream.getTracks().forEach((track) => track.stop());
            this.globalStream = null;
        } else
            console.warn('[VoiceRecog] No global stream to stop');

        if (this.audioContext) {
            this.audioContext.close().catch((error) => {
                console.warn('[VoiceRecog] Failed closing audio context', error);
            });    
            this.audioContext = null;
        } else
            console.warn('[VoiceRecog] No audio context to close');
            
        this.isMuted = false;
        this.isStreaming = false;
        this.isPostRolling = false;
        this.app?.setRuntimeState?.({ voice: 'inactive' });
    }
    
    startStreaming() {
        if(this.isStreaming) {
            console.warn('[VoiceRecog] Already streaming');
            return;
        }
        this.isStreaming = true;
        this.isPostRolling = false;
        this.app.setRuntimeState?.({ voice: 'streaming' });
        this.app.debug('[VoiceRecog] Sending control', {
            event: 'start',
        });
        this.app.pubRawAudio(JSON.stringify({
            type: 'voice_recog_control',
            event: 'start',
            uuid: this.app.uuid,
            session_id: this.app.session_id,
            conversation: this.app.conversation,
        }));
        console.log('[VoiceRecog] Sent start message');
        // send preroll audio
        this.app.pubRawAudio(this.lastChunk.buffer);
    }

    stopStreaming() {
        if(!this.isStreaming) {
            console.warn('[VoiceRecog] Already not streaming');
            return;
        }
        this.isStreaming = false;
        this.isPostRolling = true; // send the next audio frame as post-roll
        this.app.setRuntimeState?.({ voice: 'finalizing' });
    }

    _setTrackEnabled(enabled){
        if (!this.globalStream) {
            console.warn('[VoiceRecog] No global stream to toggle');
            return;
        }
        this.isMuted = !enabled;
        this.globalStream.getAudioTracks().forEach(track => {
            track.enabled = enabled;
        });
    }
    
    mute(){
        if (this.isMuted) {
            console.warn('[VoiceRecog] Already muted');
            return;
        }
        this._setTrackEnabled(false);
        this._sendFinalizeSTTMessage();
        console.log('[VoiceRecog] Mic muted (tracks disabled)');
    }
    
    _sendFinalizeSTTMessage(){
        this.app.setRuntimeState?.({ voice: 'stop-sent' });
        this.app.debug('[VoiceRecog] Sending control', {
            event: 'stop',
        });
        console.log('[VoiceRecog] Sending finalize STT message::::::');
        this.app.pubRawAudio(JSON.stringify({
            type: 'voice_recog_control',
            event: 'stop',
            uuid: this.app.uuid,
            session_id: this.app.session_id,
            conversation: this.app.conversation,
        }));
    }

    unmute(){
        if (!this.isMuted) {
            console.warn('[VoiceRecog] Already unmuted');
            return;
        }
        this._setTrackEnabled(true);
        console.log('[VoiceRecog] Mic unmuted (tracks enabled)');
    }
    
}
