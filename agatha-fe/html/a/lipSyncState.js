// LipSyncState encapsulates lip sync state variables
export class LipSyncState {
    constructor() {
        this.active = false;
        this.startTime = 0;
        this.endTime = 0;
        this.fadeOutDuration = 50; // ms - how quickly to close the mouth after speech ends
        this.mouthExpressionKey = null;
        this.mouthWidenKey = null;
        this.jawBone = null;
    }
    onstart(){
	console.log("onstart", this)
        this.active = true;
        this.startTime = performance.now();
    }
    onend(){
	console.log("onend")
        this.active = false;
        this.endTime = performance.now();
    }
    onerror(event){
	console.log("onerror")
        this.active = false;
        this.endTime = performance.now(); // Ensure state resets on error
        console.error(`Speech synthesis error: ${event.error} at ${new Date().toLocaleTimeString()}`);
    }

    // Browser speech synthesis removed - using Web Audio API only
    startSpeaking(text, voice, pitch, rate) {
        console.log("Browser speech synthesis removed - using Web Audio API instead");
        console.log("Speech parameters:", { text, voice, pitch, rate });
        // Trigger lip sync state manually for avatar animation
        this.active = true;
        this.startTime = performance.now();
        // Auto-end after a reasonable duration for animation
        setTimeout(() => {
            this.active = false;
            this.endTime = performance.now();
        }, 2000); // 2 second default duration
    }
}
