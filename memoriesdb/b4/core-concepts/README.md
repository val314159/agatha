# Core Concepts

This section covers the fundamental concepts of MemoriesDB that you'll need to understand to work effectively with the system.

## Data Model
MemoriesDB uses a flexible graph-based data model that allows you to represent complex relationships between different pieces of data. The core components are:

- **Memories**: The nodes in the graph, representing individual pieces of data
- **Edges**: The connections between memories, representing relationships
- **Sessions**: Groups of related memories that form conversations or threads

## Pub/Sub System
The real-time communication layer that enables event-driven architectures:

- **Channels**: Named message buses for organizing communication
- **Subscriptions**: Clients can subscribe to multiple channels
- **Message Broadcasting**: Real-time delivery to connected clients

## Sessions & Messages
How conversations and data are organized:

- **Sessions**: Containers for related messages and data
- **Messages**: Individual pieces of content within a session
- **Forks**: Create new conversation branches from existing ones

## Search Capabilities
Powerful search across your data:

- **Full-text search**: Find text across all content
- **Vector search**: Semantic similarity search
- **Graph traversal**: Navigate relationships between data

[Next: Data Model →](./data-model.md)
