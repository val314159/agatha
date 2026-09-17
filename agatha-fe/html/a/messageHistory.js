// Message history management class
export class MessageHistory {
    constructor() {
        this.history = [];
        this.maxMessages = 100;
    }
    
    // Clear all messages
    clear() {
        this.history = [];
        this.updateDisplay();
        this.save();
    }
    
    // Load history from localStorage
    load() {
        try {
            const savedHistory = localStorage.getItem('conversationHistory');
            if (savedHistory) {
                this.history = JSON.parse(savedHistory);
                this.updateDisplay();
            }
        } catch (e) {
            console.error('Error loading history:', e);
        }
    }
    
    // Save history to localStorage
    save() {
        try {
            localStorage.setItem('conversationHistory', JSON.stringify(this.history));
        } catch (e) {
            console.error('Error saving history:', e);
        }
    }
    
    // Add a new message to history
    add(text, isUser, cls = '') {
        const timestamp = new Date().toLocaleTimeString();
        this.history.push({
            text,
            isUser,
            cls,
            timestamp
        });
        
        // Keep only the last N messages
        if (this.history.length > this.maxMessages) {
            this.history.shift();
        }
        
        this.updateDisplay();
        this.save();
    }
    
    // Update the history display in the UI
    updateDisplay() {
        const historyList = document.getElementById('history-list');
        const astraList = document.getElementById('astra-list');
        historyList.innerHTML = '';
        if (astraList) astraList.innerHTML = '';

        this.history.forEach(item => {
            const li = document.createElement('li');
            li.className = `history-item ${item.isUser ? 'user' : 'avatar'}${item.cls ? ' ' + item.cls : ''}`;
            // <<happy>>-style expression cues are for the avatar, not reading.
            const text = item.cls === 'astra' ? item.text
                : item.text.replace(/<<[^>]*>>/g, '').trim();
            li.innerHTML = item.cls === 'astra'
                ? `${text}<span class="timestamp">${item.timestamp}</span>`
                : `<div class="font-medium">${text}<span class="timestamp">${item.timestamp}</span></div>`;
            const target = (item.cls === 'astra' && astraList) ? astraList : historyList;
            target.appendChild(li);
        });

        // Scroll to bottom
        historyList.scrollTop = historyList.scrollHeight;
        if (astraList) astraList.scrollTop = astraList.scrollHeight;
    }
}
