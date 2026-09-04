export class TurnMachine {
    constructor(app) {
        this.app = app;
        this.mode = 'OFF';
        this.state = 'NONE';
        this.bargeInEnabled = true;
        this.possibleModes = [
            'OFF',
            'PUSH_TO_TALK',
            'PUSH_TO_RELEASE',
            'CONTINUOUS',
        ];
    }
    _transition(transition, event) {
        console.log('_transition', transition, event)
        if (transition) {
            const { next, commands = [] } = transition(event)
            console.log(`next: ${next}, commands: ${JSON.stringify(commands)}`)
            if (next)
                this.state = next
            this.app.setRuntimeState?.({
                turn: this.state,
                turnMode: this.mode,
            })
            commands.forEach(cmd => this.app.executeCommand(cmd))
        }
    }
    setMode(mode) {
        if (!this.possibleModes.includes(mode))
            throw new Error(`Invalid mode: ${mode}`);
        const exitTransition = (transitions[this.mode] ?? {}).__EXIT__ 
        const entryTransition = (transitions[mode] ?? {}).__ENTRY__
        this._transition(exitTransition)
        this.mode = mode;
        this._transition(entryTransition)
        this.app.setRuntimeState?.({
            turn: this.state,
            turnMode: this.mode,
        })
    }
    setBargeInEnabled(enabled) {
        this.bargeInEnabled = Boolean(enabled);
    }
    forceWaitingForUser(reason = '') {
        if (this.mode !== 'PUSH_TO_TALK') {
            return;
        }
        console.log('forceWaitingForUser', reason)
        this.state = 'WAITING_FOR_USER_TURN'
        this.app.setRuntimeState?.({
            turn: this.state,
            turnMode: this.mode,
        })
    }
    handle(event) {
        const eventWithMachine = { ...event, machine: this }
        console.log(`handle ${event.type} in mode ${this.mode} state ${this.state}`)
        const transition = transitions[this.mode]?.[this.state]?.[event.type]
        console.log('transition', transition)
        this._transition(transition, eventWithMachine)
    }
}

const startingUserTurn = (_event) => ({
    next: 'CAPTURING_USER_UTTERANCE',
    commands: [
        { type: 'start_capturing' },
    ],
})

const restartingUserTurn = (_event) => ({
    next: 'CAPTURING_USER_UTTERANCE',
    commands: [
        { type: 'cancel_turn' },
        { type: 'start_capturing' },
    ],    
})    

const restartIfBargeInEnabled = (event) => (
    event?.machine?.bargeInEnabled ? restartingUserTurn(event) : null
)

const waitingForAssistantTurn = (_event) => ({
    next: 'WAITING_FOR_ASSISTANT',
    commands: [
        { type: 'stop_capturing' },
    ],
})

const playingAssistantSpeech = (_event) => ({
    next: 'PLAYING_ASSISTANT_SPEECH',
    commands: [
        { type: 'start_speaking' },
    ],
})

const waitingForUserTurn = (_event) => ({
    next: 'WAITING_FOR_USER_TURN',
    commands: [
        { type: 'end_turn' },
        { type: 'stop_speaking' },
        { type: 'wait_for_user' },
    ],
})

const startPushToReleaseMode = (_event) => ({
    // TODO: Implement push-to-release mode startup
    next: 'WAITING_FOR_USER_TURN',
    commands: [
        { type: 'start_capturing' },
        { type: 'start_speaking' },
    ],
})

const startContinuousMode = (_event) => ({
    // TODO: Implement continuous mode startup
    next: 'WAITING_FOR_USER_TURN',
    commands: [
        { type: 'start_capturing' },
        { type: 'start_speaking' },
    ],
})

const transitions = {
    OFF: {
        __ENTRY__: null,
        __EXIT__: null,
        // eat all interactions
    },
    PUSH_TO_TALK: {
        __ENTRY__: ()=>({
            next: 'WAITING_FOR_USER_TURN',
        }),
        __EXIT__: null,
        WAITING_FOR_USER_TURN: {
            PTT_BUTTON_DOWN: startingUserTurn,
        },
        CAPTURING_USER_UTTERANCE: {
            PTT_BUTTON_UP: waitingForAssistantTurn,
        },
        WAITING_FOR_ASSISTANT: {
            SPEAKING_STARTED: playingAssistantSpeech,
            PTT_BUTTON_DOWN: restartIfBargeInEnabled,
        },
        PLAYING_ASSISTANT_SPEECH: {
            SPEAKING_FINISHED: waitingForUserTurn,
            PTT_BUTTON_DOWN: restartIfBargeInEnabled,
        },
    },
    PUSH_TO_RELEASE: {
        __ENTRY__: startPushToReleaseMode,
        __EXIT__: null,
        // TODO: Implement push-to-release mode transitions
    },
    CONTINUOUS: {
        __ENTRY__: startContinuousMode,
        __EXIT__: null,
       // TODO: Implement continuous mode transitions
    },
}
