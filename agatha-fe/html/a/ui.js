/**
 * Manages UI elements and interactions.
 */
export class UI {
    constructor(app) {
        this.app = app;
        this.layoutSelect = null;
        this.container = null;
        this.ttsInput = null;
        this.textInput = null;
        this.convoModeIndicator = null;
        this.bargeToggle = null;
        this.debugFeed = null;
        this.debugFeedClearButton = null;
        this.runtimeStateFields = {};
        console.log('[UI] Constructor complete');
    }

    /**
     * Initialize UI elements and attach event listeners.
     * Should be called after the DOM is ready.
     */
    init() {
        console.log('[UI] Starting initialization...');
        // Find core elements
        this.layoutSelect = document.getElementById('layout-select');
        this.container = document.getElementById('avatar-container'); // Needed for layout/resize? 
        this.ttsInput = document.getElementById('tts-input');
        this.textInput = document.getElementById('text-input');
        this.convoModeIndicator = document.getElementById('convo-mode-indicator');
        this.bargeToggle = document.getElementById('barge-toggle');
        this.debugFeed = document.getElementById('debug-feed');
        this.debugFeedClearButton = document.getElementById('debug-feed-clear');
        this.runtimeStateFields = {
            ptt: document.getElementById('state-ptt'),
            voice: document.getElementById('state-voice'),
            backend: document.getElementById('state-backend'),
            audio: document.getElementById('state-audio'),
            turn: document.getElementById('state-turn'),
            convo: document.getElementById('state-convo'),
        };

        if (!this.layoutSelect || !this.container || !this.ttsInput || !this.textInput) {
             console.error('[UI] Failed to find essential UI elements!');
             // Decide how critical these are - maybe return or throw?
        }

        this.installEventListeners();
        this.updateConvoModeIndicator(this.app.convoMode);
        this.updateBargeToggle(this.app.turnMachine.bargeInEnabled);
        this.updateRuntimeState(this.app.runtimeState);
        console.log('[UI] Initialization complete.');
        console.log('[UI] bargeToggle element:', this.bargeToggle);
        console.log('[UI] convoModeIndicator element:', this.convoModeIndicator);
    }

    addDebugEvent(message) {
        if (!this.debugFeed) {
            return;
        }

        const line = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString([], {
            hour12: false,
            minute: '2-digit',
            second: '2-digit',
        });
        line.textContent = `${timestamp} ${message}`;
        this.debugFeed.prepend(line);

        while (this.debugFeed.childElementCount > 30) {
            this.debugFeed.removeChild(this.debugFeed.lastChild);
        }
    }

    updateConvoModeIndicator(mode) {
        if (!this.convoModeIndicator) {
            return;
        }
        const normalizedMode = ['sleep', 'idle', 'active'].includes(mode) ? mode : 'unknown';
        this.convoModeIndicator.textContent = normalizedMode;
        this.convoModeIndicator.className = 'rounded-md border px-2 py-1 font-semibold uppercase tracking-wide transition-colors hover:bg-white/10';

        if (normalizedMode === 'active') {
            this.convoModeIndicator.classList.add('border-cyan-400/40', 'bg-cyan-400/10', 'text-cyan-200');
        } else if (normalizedMode === 'idle') {
            this.convoModeIndicator.classList.add('border-amber-400/40', 'bg-amber-400/10', 'text-amber-200');
        } else if (normalizedMode === 'sleep') {
            this.convoModeIndicator.classList.add('border-fuchsia-400/40', 'bg-fuchsia-400/10', 'text-fuchsia-200');
        } else {
            this.convoModeIndicator.classList.add('border-slate-400/40', 'bg-slate-400/10', 'text-slate-200');
        }
    }

    updateBargeToggle(enabled) {
        if (!this.bargeToggle) {
            return;
        }
        this.bargeToggle.textContent = enabled ? 'barge' : 'queue';
        this.bargeToggle.className = 'rounded-md border px-2 py-1 font-semibold uppercase tracking-wide transition-colors hover:bg-white/10';
        if (enabled) {
            this.bargeToggle.classList.add('border-emerald-400/40', 'bg-emerald-400/10', 'text-emerald-200');
        } else {
            this.bargeToggle.classList.add('border-slate-400/40', 'bg-slate-400/10', 'text-slate-200');
        }
    }

    updateRuntimeState(state = {}) {
        const values = {
            ptt: state.ptt || 'up',
            voice: state.voice || 'idle',
            backend: state.backend || 'idle',
            audio: state.audio || 'idle',
            turn: state.turn || 'none',
            convo: state.convo || 'active',
        };

        for (const [key, value] of Object.entries(values)) {
            const el = this.runtimeStateFields?.[key];
            if (!el) {
                continue;
            }
            el.textContent = value;
            el.title = value;
            el.className = 'rounded border px-1.5 py-0.5';
            this.applyRuntimeStateClass(el, key, value);
        }
    }

    applyRuntimeStateClass(el, key, value) {
        const activeValues = new Set([
            'down',
            'streaming',
            'finalizing',
            'CAPTURING_USER_UTTERANCE',
            'active',
            'turn-started',
            'llm-streaming',
            'audio-playing',
        ]);
        const waitingValues = new Set([
            'WAITING_FOR_ASSISTANT',
            'PLAYING_ASSISTANT_SPEECH',
            'stop-sent',
            'postroll',
            'waiting-audio',
            'audio-generating',
            'audio-draining',
        ]);
        const errorValues = new Set([
            'error',
            'inactive',
        ]);

        if (errorValues.has(value)) {
            el.classList.add('border-red-400/50', 'bg-red-400/10', 'text-red-200');
        } else if (activeValues.has(value)) {
            el.classList.add('border-emerald-400/50', 'bg-emerald-400/10', 'text-emerald-200');
        } else if (waitingValues.has(value)) {
            el.classList.add('border-amber-400/50', 'bg-amber-400/10', 'text-amber-200');
        } else if (key === 'convo' && value === 'sleep') {
            el.classList.add('border-fuchsia-400/50', 'bg-fuchsia-400/10', 'text-fuchsia-200');
        } else {
            el.classList.add('border-slate-400/40', 'bg-slate-400/10', 'text-slate-200');
        }
    }

    // Placeholder for event listeners - will be moved from Application
    installEventListeners() {
        console.log('[UI] Installing event listeners...!');
        
        // Helper function to add event listeners cleanly
        const addButtonListener = (id, callback) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', callback);
            } else {
                // It's useful to know if a button defined in config is missing
                console.warn(`[UI] Button with ID "${id}" not found or not clickable.`);
            }
        };

        if (this.debugFeedClearButton) {
            this.debugFeedClearButton.addEventListener('click', () => {
                if (this.debugFeed) {
                    this.debugFeed.innerHTML = '';
                }
            });
        }

        if (this.convoModeIndicator) {
            console.log('[UI] Attaching convo mode indicator click listener');
            const convoModeOrder = ['active', 'idle', 'sleep'];
            this.convoModeIndicator.addEventListener('click', () => {
                console.log('[UI] Convo mode indicator clicked, current mode:', this.app.convoMode);
                const currentMode = convoModeOrder.includes(this.app.convoMode) ? this.app.convoMode : 'active';
                const currentIndex = convoModeOrder.indexOf(currentMode);
                const nextMode = convoModeOrder[(currentIndex + 1) % convoModeOrder.length];
                console.log('[UI] Switching to mode:', nextMode);
                this.app.setConvoMode(nextMode);
            });
        } else {
            console.warn('[UI] convoModeIndicator element not found!');
        }

        if (this.bargeToggle) {
            this.bargeToggle.addEventListener('click', () => {
                const currentState = this.app.turnMachine.bargeInEnabled;
                this.app.turnMachine.setBargeInEnabled(!currentState);
                this.updateBargeToggle(!currentState);
                console.log('[UI] Barge-in toggled:', !currentState);
            });
        }

        // --- Animation Buttons ---
        const animationButtons = [
            { id: 'dance-rumba', animation: '/models/Rumba Dancing.fbx', message: '*starts dancing rumba*' },
            { id: 'dance-salute', animation: '/models/Salute.fbx', message: '*salutes*' },
            { id: 'dance-texting', animation: '/models/Texting While Standing.fbx', message: '*checks phone while standing*' },
            { id: 'dance-silly', animation: '/models/Silly Dancing.fbx', message: '*starts dancing silly*' },
            { id: 'dance-stretch', animation: '/models/Arm Stretching.fbx', message: '*stretches arms*' },
            { id: 'dance-dying', animation: '/models/Dying.fbx', message: '*melodramatically dies**' }
        ];

        // --- Keyframe Dance Buttons ---
        const keyframeButtons = [
            { id: 'keyframe-kpop', animation: 'kpopPoint', message: '*does K-pop point dance*' },
            { id: 'keyframe-groove', animation: 'basicGroove', message: '*starts basic groove*' },
            { id: 'keyframe-hiphop', animation: 'hipHop', message: '*starts hip hop dance*' },
            { id: 'keyframe-salsa', animation: 'salsa', message: '*starts salsa dance*' },
            { id: 'keyframe-shoulder', animation: 'kpopShoulder', message: '*does K-pop shoulder dance*' },
            { id: 'keyframe-armwave', animation: 'kpopArmWave', message: '*does K-pop arm wave*' }
        ];

        animationButtons.forEach(config => {
            addButtonListener(config.id, () => {
                if (!this.app.sceneRenderer) {
                    console.error("[UI] SceneRenderer not initialized via app!");
                    return;
                }
                this.app.sceneRenderer.loadFBX(config.animation, this.app);
                this.app.messageHistory.add(config.message, false);
            });
        });

        // Toggle head turn
        addButtonListener('toggle-head-turn', () => {
            if (!this.app.sceneRenderer.idleAnimationState.headTurn) {
                console.error('[UI] headTurn state not initialized');
                return;
            }
            const wasActive = this.app.sceneRenderer.idleAnimationState.headTurn.active;
            this.app.sceneRenderer.idleAnimationState.headTurn.active = !this.app.sceneRenderer.idleAnimationState.headTurn.active;
            
            // Track when head turn is disabled for cooldown (clock-based)
            if (wasActive && !this.app.sceneRenderer.idleAnimationState.headTurn.active) {
                this.app.sceneRenderer.idleAnimationState.headTurn.lastActiveTime = this.app.clock.getElapsedTime();
            }
            
            const status = this.app.sceneRenderer.idleAnimationState.headTurn.active ? 'enabled' : 'disabled';
            console.log('[UI] Head turn', status);
            this.app.messageHistory.add(`*head turn ${status}*`, false);
        });

        addButtonListener('stop-dance', () => {
             if (!this.app.sceneRenderer) {
                console.error("[UI] SceneRenderer not initialized via app!");
                return;
            }
            this.app.sceneRenderer.unloadFBX();
            this.app.messageHistory.add('*stops animation*', false);
        });

        // --- Keyframe Dance Handlers ---
        keyframeButtons.forEach(config => {
            addButtonListener(config.id, () => {
                if (!this.app.danceFrameSystem) {
                    console.error("[UI] DanceFrameSystem not initialized!");
                    return;
                }
                
                // Import the sample animations
                import('./danceData.js').then(module => {
                    const animationName = config.animation + 'Keyframe';
                    const animation = module.SampleAnimations[animationName];
                    
                    if (animation) {
                        this.app.danceFrameSystem.loadAnimation(animation);
                        this.app.danceFrameSystem.start();
                        this.app.messageHistory.add(config.message, false);
                        console.log(`[UI] Started keyframe dance: ${animationName}`);
                    } else {
                        console.error(`[UI] Animation not found: ${animationName}`);
                    }
                }).catch(err => {
                    console.error("[UI] Failed to load danceFormat.js:", err);
                });
            });
        });

        addButtonListener('stop-keyframe', () => {
            if (!this.app.danceFrameSystem) {
                console.error("[UI] DanceFrameSystem not initialized!");
                return;
            }
            this.app.danceFrameSystem.stop();
            this.app.messageHistory.add('*stops keyframe animation*', false);
        });

        addButtonListener('reset-pose', () => {
            if (!this.app.danceFrameSystem) {
                console.error("[UI] DanceFrameSystem not initialized!");
                return;
            }
            this.app.danceFrameSystem.resetToNeutral();
            this.app.messageHistory.add('*resets to neutral pose*', false);
        });

        // --- Model Load Buttons ---
        const modelLoadButtons = [
            { id: 'load-agatha', modelPath: '/models/avatar.vrm', modelName: 'agatha' },
            { id: 'load-constraint', modelPath: '/models/VRM1_Constraint_Twist_Sample.vrm', modelName: 'constraint' },
            { id: 'load-blockman', modelPath: '/models/cube.gltf', modelName: 'blockman' }
        ];

        modelLoadButtons.forEach(config => {
            addButtonListener(config.id, () => {
                if (!this.app.sceneRenderer) {
                    console.error("[UI] SceneRenderer not initialized via app!");
                    return;
                }
                console.log(`[UI] Loading model via button: ${config.modelPath}`);
                this.app.sceneRenderer.loadVRMModel(this.app, config.modelPath);
                // UrlParams.updateUrlParam('vrm', config.modelName); // App/Renderer should handle this on success?
            });
        });

        // --- TTS Input and Button --- 
        this.ttsInput = this.ttsInput || document.getElementById('tts-input'); // Already looked up in init
        this.speakButton = document.getElementById('speak-button'); // Lookup speak button

        const handleSpeakInput = (element) => {
	    const ttsInput = element || this.ttsInput
            if (!ttsInput) {
                 console.error("[UI] TTS Input element not found!");
                 return;
            }
            const text = ttsInput.value.trim();
            if (!text) {
                console.log("[UI] Speak triggered, but input is empty.");
                return;
            }
            console.log("[UI] Sending typed text as user turn:", text);
            this.app.talkToAvatar(text, true);
            ttsInput.value = '';
            ttsInput.focus();
        };

        if(this.speakButton) {
            this.speakButton.addEventListener('click', handleSpeakInput);
        } else {
             console.warn('[UI] Speak Button element not found.');
        }

        if (this.ttsInput) {
            this.ttsInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSpeakInput();
                }
            });
        } else {
            console.warn('[UI] TTS Input element not found.');
        }

        if (this.textInput) {
            this.textInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    const text = this.textInput.value.trim();
                    if (!text) {
                        console.log('[UI] Text input empty; not sending');
                        return;
                    }
                    console.log('[UI] Sending chat text:', text);
                    this.app.talkToAvatar(text);
                    this.textInput.value = '';
                }
            });
        } else {
            console.warn('[UI] Text Input element not found.');
        }

        // --- Clear History Button ---
        addButtonListener('clear-history', () => this.app.messageHistory.clear());
        addButtonListener('toggle-history', () => {
            const historyContainer = document.getElementById('history-container');
            const toggleButton = document.getElementById('toggle-history');
            if (!historyContainer || !toggleButton) {
                console.warn('[UI] History toggle elements not found.');
                return;
            }

            const hidden = historyContainer.classList.toggle('history-hidden');
            toggleButton.textContent = hidden ? 'Show History' : 'Hide History';
            toggleButton.setAttribute('aria-pressed', hidden ? 'true' : 'false');
        });
        addButtonListener('orient-surface', () => {
            const orientButton = document.getElementById('orient-surface');
            const surfaceFrame = document.getElementById('surface-frame');
            const oriented = document.body.classList.toggle('surface-oriented');

            if (this.app.sceneRenderer?.controls) {
                this.app.sceneRenderer.controls.enabled = !oriented;
            }

            if (orientButton) {
                orientButton.textContent = oriented ? 'Agatha' : 'Orient';
                orientButton.setAttribute('aria-pressed', oriented ? 'true' : 'false');
            }

            if (oriented && surfaceFrame) {
                surfaceFrame.focus();
            } else {
                this.removeFocus();
            }
        });

        // --- Expression Buttons ---
        const expressionButtonContainer = document.getElementById('expression-buttons');
        if (expressionButtonContainer) {
            expressionButtonContainer.querySelectorAll('button').forEach(btn => {
                const expression = btn.dataset.expression;
                if (expression && this.app.sceneRenderer) {
                    btn.addEventListener('click', () => {
                         // Assuming currentVRM is managed by SceneRenderer or App
                         if (this.app.currentVRM) { // Check on app instance
                             this.app.sceneRenderer.setExpression(this.app.currentVRM, expression); // Pass app.currentVRM
                             this.app.messageHistory.add(`*expression: ${expression}*`, false);
                         } else {
                             console.warn('[UI] Cannot set expression, current VRM not found on app.'); // Updated warning message
                         }
                    });
                }
            });
        }

        var pushToTalkActive = false
        const pttButton = document.getElementById('ptt-button')

        console.log("Push to talk active:", pushToTalkActive, pttButton)

        const setPushToTalkButtonActive = (active) => {
            if (!pttButton) {
                return
            }
            pttButton.classList.toggle("btn-warning", active)
            pttButton.classList.toggle("btn-info", !active)
            pttButton.setAttribute("aria-pressed", active ? "true" : "false")
        }

        const startPushToTalk = () => {
//            console.log("Start push to talk")
            if (pushToTalkActive) {
                return
            }
            pushToTalkActive = true
            setPushToTalkButtonActive(true)
            console.log("Push to talk active")
            this.app.pttButtonDown()
        }

        const stopPushToTalk = () => {
//            console.log("Stop push to talk")
            if (!pushToTalkActive) {
                setPushToTalkButtonActive(false)
                return
            }
            console.log("Push to talk disabled")
            pushToTalkActive = false
            setPushToTalkButtonActive(false)
            this.app.pttButtonUp()
        }

        if (pttButton) {
            const preventDefault = (event) => event.preventDefault()
            const startPointerPushToTalk = (event) => {
                preventDefault(event)
                if (event.pointerId != null) {
                    pttButton.setPointerCapture(event.pointerId)
                }
                startPushToTalk()
            }
            const stopPointerPushToTalk = (event) => {
                preventDefault(event)
                stopPushToTalk()
            }
            pttButton.addEventListener('pointerdown', startPointerPushToTalk)
            pttButton.addEventListener('pointerup', stopPointerPushToTalk)
            pttButton.addEventListener('pointercancel', stopPointerPushToTalk)
            pttButton.addEventListener('lostpointercapture', stopPushToTalk)
            pttButton.addEventListener('contextmenu', preventDefault)
            console.log("Push to talk event listeners added2")
        } else {
            console.warn('[UI] PTT button element not found.')
        }

        // --- Global Key Listener --- 
        document.addEventListener('keyup', (event) => {
            if (event.key.toLowerCase() === 'm' || event.key === 'Control') {
                if (pushToTalkActive) {
                    stopPushToTalk()
                }
            }
        });
        window.addEventListener('blur', stopPushToTalk);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.removeFocus(); // Call UI's removeFocus
                return;
            }
            if (event.shiftKey && event.altKey && event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT) {
                event.preventDefault();
                this.app.shellModal.show();
                return;
            }
            if (event.shiftKey && event.altKey && event.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT) {
                event.preventDefault();
                const modal = document.getElementById('shortcut-modal');
                if (modal && typeof modal.showModal === 'function') {
                    console.log('[UI] Showing shortcut modal');
                    modal.showModal();
                } else {
                    console.warn('[UI] Shortcut modal element #shortcut-modal not found or lacks showModal method.');
                }
                return; 
            }
            if (event.altKey && (event.key === '`' || event.key.toLowerCase() === 'o')) {
                event.preventDefault(); 
                const clearButton = document.getElementById('clear-history'); 
                if (clearButton && typeof clearButton.click === 'function') {
                    console.log(`[UI] Triggering clear history button via Alt+${event.key}`);
                    clearButton.click();
                } else {
                    console.warn(`[UI] Alt+${event.key}: Clear history button (#clear-history) not found.`);
                }
                return;
            }
            if (event.altKey && event.key.toLowerCase() === 'p') {
                event.preventDefault();
                this.setLayout('portrait'); 
                if (this.layoutSelect) this.layoutSelect.value = 'portrait';
                return;
            }
            if (event.altKey && event.key.toLowerCase() === 'l') {
                event.preventDefault();
                this.setLayout('landscape');
                if (this.layoutSelect) this.layoutSelect.value = 'landscape';
                return;
            }
            if (event.ctrlKey && event.key === '.') {
                event.preventDefault();
                console.log('Stopping avatar speech via Ctrl+.');
                this.app.stopAvatarSpeech();
                return;
            }
            if (event.ctrlKey && event.key.toLowerCase() === 'm') {
                event.preventDefault();
                startPushToTalk()
                return;
            }
            if (event.ctrlKey && event.key === ',') {
                event.preventDefault();
                console.log('Switching to continuous mode');
                this.app.enterContinuousMode();
                return;
            }

            // --- Expression/Action/Focus Shortcuts (Alt + Key) --- 
            if (event.altKey && !event.ctrlKey && !event.metaKey) { 
                const keyMap = {
                    'a': 'happy', 's': 'angry', 'd': 'sad', 'z': 'relaxed', 'x': 'surprised', 'c': 'neutral',
                    'q': 'load-agatha', 'w': 'load-constraint', 'e': 'load-blockman',
                    'r': 'dance-rumba', 't': 'dance-texting', 'y': 'dance-salute',
                    'f': 'say-hello', 'g': 'tell-more', 'h': 'sayTestPhraseBtn'
                };
                const targetIdentifier = keyMap[event.key.toLowerCase()];
                if (targetIdentifier) {
                    event.preventDefault(); 
                    let button = document.querySelector(`.controls-container button[data-expression="${targetIdentifier}"]`);
                    if (!button) button = document.getElementById(targetIdentifier);
                    if (button && button.matches('.controls-container button, .controls-container select')) { 
                        console.log(`[UI] Triggering action '${targetIdentifier}' via Alt+${event.key}`);
                        button.click();
                    } else {
                        console.warn(`[UI] Alt+${event.key}: Button/Element for action '${targetIdentifier}' not found or not in controls.`);
                    }
                    return;
                }
                const focusMap = {
                    'v': '#voice-select', 'b': '#pitch-slider', 'n': '#rate-slider'
                };
                const focusSelector = focusMap[event.key.toLowerCase()];
                if (focusSelector) {
                    event.preventDefault();
                    const elementToFocus = document.querySelector(focusSelector);
                    if (elementToFocus) {
                        console.log(`[UI] Focusing '${focusSelector}' via Alt+${event.key}`);
                        elementToFocus.focus();
                    } else {
                        console.warn(`[UI] Alt+${event.key}: Element to focus '${focusSelector}' not found.`);
                    }
                    return;
                }
            }

            // --- Arrow Key Navigation --- 
            if (!event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && 
                (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                const controls = Array.from(document.querySelectorAll('.controls-container button:not([disabled]), .controls-container select:not([disabled]), .controls-container input[type=range]:not([disabled])'));
                const focusedIndex = controls.findIndex(el => el === document.activeElement);
                let nextIndex = -1;
                if (focusedIndex !== -1) {
                    nextIndex = (event.key === 'ArrowLeft') ? (focusedIndex - 1 + controls.length) % controls.length : (focusedIndex + 1) % controls.length;
                } else if (controls.length > 0) {
                    nextIndex = (event.key === 'ArrowRight') ? 0 : controls.length - 1;
                }
                if (nextIndex !== -1) {
                    event.preventDefault();
                    controls[nextIndex].focus();
                }
            }

            // --- Direct Typing to TTS Input --- 
            const activeElement = document.activeElement;
            const isTypingElement = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
            if (this.ttsInput && !isTypingElement && !event.altKey && !event.ctrlKey && !event.metaKey && event.key.length === 1) {
                 const isFocusOnNonTextInput = activeElement && activeElement.type === 'range'; 
                 if (!isFocusOnNonTextInput) {
                    console.log('[UI] Focusing TTS input due to direct typing.');
                    this.ttsInput.focus();
                 }
            }
        }); // End keydown listener

        // --- Layout Select --- ADDED
        if (this.layoutSelect) {
            this.layoutSelect.addEventListener('change', (event) => {
                this.setLayout(event.target.value);
            });
        } else {
            console.warn('[UI] Layout select element not found.');
        }

        // --- Window Resize --- (Listener remains here, acts on app's renderer)
        let resizeTimeout;
        window.addEventListener('resize', () => {
             clearTimeout(resizeTimeout);
             resizeTimeout = setTimeout(() => {
                if (this.app.sceneRenderer.renderer && this.container) { // Check app's container
                    const width = this.container.clientWidth;
                    const height = this.container.clientHeight;
                    if (width > 0 && height > 0) {
                        this.app.sceneRenderer.camera.aspect = width / height;
                        this.app.sceneRenderer.camera.updateProjectionMatrix();
                        this.app.sceneRenderer.renderer.setSize(width, height);
                    }
                }
             }, 150);
        });
        // Trigger initial resize slightly after load - Keep this in Application.init?
        // setTimeout(() => window.dispatchEvent(new Event('resize')), 200); 
    }

    setLayout(layout) {
        console.log(`[UI] Setting layout to: ${layout}`);
        // Target document.body for layout classes
        if (layout === 'portrait') {
            document.body.classList.add('layout-portrait');
            document.body.classList.remove('layout-landscape');
        } else { // Default to landscape
            document.body.classList.remove('layout-portrait');
            document.body.classList.add('layout-landscape');
        }
        // Update URL parameter - Consider if this should happen here or elsewhere
        // UrlParams.updateUrlParam('layout', layout);

        // Trigger resize event after layout change (delays slightly)
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100); // Short delay
    }

    removeFocus() {
        console.log('[UI] Removing focus...');
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
             console.log('[UI] Blurring active element:', document.activeElement);
             document.activeElement.blur();
        }
        // Ensure focus isn't immediately grabbed by the body or something else unintended
        // Sometimes blurring isn't enough if a global listener refocuses
        window.focus(); // Attempt to set focus to the window itself
    }

    // Method to update the pitch value display
    updatePitchValueLabel(value) {
        if (this.pitchValueLabel) {
            this.pitchValueLabel.textContent = parseFloat(value).toFixed(2);
        } else {
             console.warn('[UI] Pitch value label element not found for update.');
        }
    }

    // Method to update the rate value display
    updateRateValueLabel(value) {
        if (this.rateValueLabel) {
            this.rateValueLabel.textContent = parseFloat(value).toFixed(2);
        } else {
            console.warn('[UI] Rate value label element not found for update.');
        }
    }
}
