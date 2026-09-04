export async function getAecMicrophoneStream(sampleRate = 16000) {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia is unavailable; use HTTPS or localhost');
    }

    const constraints = {
        audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate,
            channelCount: 1,
        },
    };

    try {
        return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`AEC microphone request failed: ${message}`);
    }
}
