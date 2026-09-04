// Blinker class to handle avatar eye blinking
export class Blinker {
    constructor() {
        // Blinking state
        this.isBlinking = false;
        this.blinkStartTime = 0;
        this.blinkDuration = 0;
        this.nextBlinkTime = performance.now() + this.getRandomBlinkInterval();
        this.isDoubleBlinking = false;
        this.secondBlinkDelay = 0;
        this.currentBlinkStrength = 1;
        this.secondBlinkStrength = 1;
    }

    /**
     * Get random blink interval between 2-6 seconds
     * People typically blink every 2-10 seconds, with most around 3-4 seconds
     * We'll use a slightly skewed distribution to favor more common intervals
     */
    getRandomBlinkInterval() {
        const minInterval = 2000; // 2 seconds
        const maxInterval = 6000; // 6 seconds
        
        // Use a weighted random approach to favor middle values
        const rand = Math.random();
        const skew = 0.7; // Higher values favor the middle more
        
        // This creates a distribution that favors values in the middle
        const skewedRand = Math.pow(Math.sin(rand * Math.PI), skew);
        
        return minInterval + skewedRand * (maxInterval - minInterval);
    }

    /**
     * Get random blink duration between 100-300ms
     * Normal blinks last about 100-400ms, with most around 150-200ms
     */
    getRandomBlinkDuration() {
        const minDuration = 100;
        const maxDuration = 300;
        return minDuration + Math.random() * (maxDuration - minDuration);
    }

    /**
     * Randomly decide if this should be a double blink (about 15% chance)
     */
    shouldDoubleBlink() {
        return Math.random() < 0.15; // 15% chance of double blink
    }

    /**
     * Get random delay between blinks in a double-blink (150-400ms)
     */
    getDoubleBlinkDelay() {
        return 150 + Math.random() * 250;
    }

    /**
     * Update the blink state and apply to VRM model
     * @param {number} now - Current timestamp from performance.now()
     * @param {object} currentVRM - The current VRM model
     */
    update(now, currentVRM) {
        // Check if it's time to start a new blink
        if (!this.isBlinking && now >= this.nextBlinkTime) {
            this.isBlinking = true;
            this.blinkStartTime = now;
            this.blinkDuration = this.getRandomBlinkDuration();
            this.isDoubleBlinking = this.shouldDoubleBlink();
            this.currentBlinkStrength = 0.9 + Math.random() * 0.1;
            this.secondBlinkStrength = 0.9 + Math.random() * 0.1;
            this.currentBlinkStrength = 1.0;
            this.secondBlinkStrength = 1.0;
            if (this.isDoubleBlinking) {
                this.secondBlinkDelay = this.getDoubleBlinkDelay();
            }
            console.log(`Blink started at ${new Date().toLocaleTimeString()}, duration: ${this.blinkDuration}ms${this.isDoubleBlinking ? ', double blink!' : ''}`);
        }
        
        // Handle ongoing blink
        if (this.isBlinking) {
            const blinkElapsed = now - this.blinkStartTime;
            let blinkValue = 0;
            
            // First blink
            if (blinkElapsed <= this.blinkDuration) {
                // Create a natural blink curve (faster closing, slower opening)
                const progress = blinkElapsed / this.blinkDuration;
                if (progress < 0.3) {
                    // Closing phase (faster)
                    blinkValue = progress / 0.3;
                } else {
                    // Opening phase (slower)
                    blinkValue = 1 - ((progress - 0.3) / 0.7);
                }
                
                // Keep blink strength stable for the duration of this blink.
                blinkValue *= this.currentBlinkStrength;
            } 
            // Handle double blink
            else if (this.isDoubleBlinking && blinkElapsed <= this.blinkDuration + this.secondBlinkDelay + this.blinkDuration) {
                // Gap between blinks
                if (blinkElapsed <= this.blinkDuration + this.secondBlinkDelay) {
                    blinkValue = 0;
                } else {
                    // Second blink
                    const secondBlinkElapsed = blinkElapsed - (this.blinkDuration + this.secondBlinkDelay);
                    const progress = secondBlinkElapsed / this.blinkDuration;
                    if (progress < 0.3) {
                        // Closing phase (faster)
                        blinkValue = progress / 0.3;
                    } else {
                        // Opening phase (slower)
                        blinkValue = 1 - ((progress - 0.3) / 0.7);
                    }
                    
                    // Keep second-blink strength stable as well.
                    blinkValue *= this.secondBlinkStrength;
                }
            } else {
                // Blink complete, schedule next one
                this.isBlinking = false;
                this.nextBlinkTime = now + this.getRandomBlinkInterval();
                console.log(`Blink complete at ${new Date().toLocaleTimeString()}`);
            }
            
            // Apply blink to VRM
            this.applyBlinkToVRM(currentVRM, blinkValue);
        }
    }

    /**
     * Apply the blink value to the VRM model
     * @param {object} currentVRM - The current VRM model
     * @param {number} blinkValue - The blink value between 0 and 1
     */
    applyBlinkToVRM(currentVRM, blinkValue) {
        if (!currentVRM) return;
        
        // For VRM 1.0+
        if (currentVRM.expressionManager || currentVRM.expressions) {
            const exprMgr = currentVRM.expressionManager || currentVRM.expressions;
            
            // Try common blink expression names
            const blinkExpressions = ['blink', 'eye_blink', 'blink_l', 'blink_r', 'wink'];
            
            let found = false;
            if (exprMgr._expressionMap) {
                for (const expr of blinkExpressions) {
                    if (typeof exprMgr.setValue === 'function' && 
                        ((exprMgr._expressionMap instanceof Map && exprMgr._expressionMap.has(expr)) || 
                         (typeof exprMgr._expressionMap === 'object' && expr in exprMgr._expressionMap))) {
                        exprMgr.setValue(expr, blinkValue);
                        found = true;
                    }
                }
            }
            
            // If no specific blink expression, try to find eye expressions
            if (!found && exprMgr.expressions) {
                const eyeExpressions = Object.keys(exprMgr.expressions).filter(k => 
                    k.toLowerCase().includes('eye') && 
                    (k.toLowerCase().includes('close') || k.toLowerCase().includes('shut') || k.toLowerCase().includes('blink'))
                );
                
                for (const expr of eyeExpressions) {
                    exprMgr.expressions[expr].weight = blinkValue;
                    found = true;
                }
            }
        }
        
        // For VRM 0.x
        if (currentVRM.blendShapeProxy) {
            // Try common blink blend shape names
            const blinkShapes = ['blink', 'eye_blink', 'Blink', 'Blink_L', 'Blink_R', 'EYE_CLOSE'];
            
            for (const shape of blinkShapes) {
                if (currentVRM.blendShapeProxy._blendShapeGroups && 
                    shape in currentVRM.blendShapeProxy._blendShapeGroups) {
                    currentVRM.blendShapeProxy.setValue(shape, blinkValue);
                }
            }
        }
    }
}
