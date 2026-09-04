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
    add(text, isUser) {
        const timestamp = new Date().toLocaleTimeString();
        this.history.push({
            text,
            isUser,
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
        historyList.innerHTML = '';
        
        this.history.forEach(item => {
            const li = document.createElement('li');
            li.className = `history-item ${item.isUser ? 'user' : 'avatar'}`;
            li.innerHTML = `
              <div class="font-medium">${item.text}</div>
              <span class="timestamp">${item.timestamp}</span>
            `;
            historyList.appendChild(li);
        });
        
        // Scroll to bottom
        historyList.scrollTop = historyList.scrollHeight;
    }
}
