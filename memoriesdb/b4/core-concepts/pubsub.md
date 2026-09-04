# Pub/Sub System

MemoriesDB includes a lightweight, WebSocket-based publish-subscribe system for real-time communication between clients and the server.

## Key Characteristics

- **Ephemeral Messaging**: Messages are only delivered to currently connected clients
- **No Persistence**: Messages are not stored - clients must handle reconnection and state sync
- **Channel-based**: Organize messages using named channels
- **Efficient**: Built on gevent for high concurrency

## Core Components

### Channels
- Named message buses for organizing communication
- Clients can subscribe to multiple channels
- No need to pre-define channels - they're created on demand

### Message Flow
1. A client connects to the WebSocket server
2. Client subscribes to one or more channels
3. Messages published to a channel are broadcast to all connected subscribers
4. If a client disconnects, it stops receiving messages until it reconnects

## Example Usage

### Server Setup
```python
# Start the WebSocket server
from memoriesdb.hub import app
app.run(host='0.0.0.0', port=5002)
```

### Client-Side (JavaScript)
```javascript
// Connect to WebSocket server and subscribe to channels
const ws = new WebSocket('ws://localhost:5002/ws?c=updates&c=notifications');

// Handle incoming messages
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', data);
};

// Publish a message
function publish(channel, content) {
    ws.send(JSON.stringify({
        method: 'pub',
        params: {
            channel: channel,
            content: content
        }
    }));
}
```

### Handling Disconnections

Since the pub/sub system doesn't persist messages, you'll need to handle reconnections and state synchronization:

```javascript
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let reconnectTimeout;

function connectWebSocket() {
    const ws = new WebSocket('ws://localhost:5002/ws?c=updates');
    
    ws.onopen = () => {
        console.log('Connected to WebSocket server');
        reconnectAttempts = 0;
        syncState(); // Sync current state after reconnection
    };
    
    ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        
        // Implement exponential backoff for reconnection
        if (reconnectAttempts < maxReconnectAttempts) {
            const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            console.log(`Reconnecting in ${timeout}ms...`);
            
            reconnectTimeout = setTimeout(() => {
                reconnectAttempts++;
                connectWebSocket();
            }, timeout);
        }
    };
    
    return ws;
}

// Initial connection
let ws = connectWebSocket();

// Sync current state from the server
async function syncState() {
    // Query the latest state from your API
    const latestState = await fetch('/api/latest-state');
    updateUI(latestState);
}
```

## Best Practices

1. **Handle Reconnections**: Implement robust reconnection logic
2. **Sync State**: Always sync state after reconnecting
3. **Use Meaningful Channel Names**: Be specific with channel names
4. **Keep Messages Small**: The system is designed for small, frequent messages
5. **Error Handling**: Always handle WebSocket errors and closures

[Next: Sessions & Messages →](./sessions.md)
