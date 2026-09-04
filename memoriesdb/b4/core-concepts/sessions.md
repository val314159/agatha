# Sessions & Messages

Sessions and messages are the primary way to organize conversations and related data in MemoriesDB.

## Sessions

A session represents a conversation or a coherent thread of messages. It can be:
- A chat conversation
- A support ticket
- A document editing session
- Any logical grouping of messages

### Creating a Session

```sql
-- Create a new session
SELECT create_session(
    'Team Discussion', 
    '{"type": "group_chat", "members": ["user1", "user2"], "status": "active"}'
);
```

### Session Structure

Sessions are stored as memories with a special type:

```json
{
  "id": "session-123",
  "content": "Team Discussion",
  "_metadata": {
    "type": "session",
    "status": "active",
    "members": ["user1", "user2"],
    "created_by": "user1"
  },
  "_created_at": "2025-06-27T10:00:00Z"
}
```

## Messages

Messages are the individual pieces of content within a session. Each message:
- Belongs to a session
- Can have a parent message (for threading)
- Includes metadata about the sender and content

### Adding a Message

```sql
-- Add a message to a session
SELECT add_message_to_session(
    'session-123',           -- Session ID
    'user1',                 -- Sender
    'Hello team!',           -- Message content
    '{"type": "text"}'       -- Additional metadata
);
```

### Message Structure

```json
{
  "id": "msg-456",
  "content": "Hello team!",
  "_metadata": {
    "type": "text",
    "sender": "user1",
    "sent_at": "2025-06-27T10:05:00Z"
  },
  "session_id": "session-123",
  "parent_id": null,
  "_created_at": "2025-06-27T10:05:00Z"
}
```

## Forks

Forks allow you to create new conversation branches from existing ones, useful for:
- Exploring alternative discussion paths
- Creating focused sub-conversations
- Branching decision points

### Creating a Fork

```sql
-- Fork a session
SELECT fork_session(
    'original-session-id',   -- Original session ID
    'Mobile Design Discussion',  -- New session title
    '{"parent_message_id": "msg-123", "reason": "Focus on mobile design"}'  -- Metadata
);
```

## Querying Session Data

### Get Session Messages

```sql
-- Get all messages in a session
SELECT * FROM get_session_messages('session-123');

-- Get formatted conversation
SELECT * FROM get_formatted_conversation('session-123');

-- Get conversation as text
SELECT get_conversation_text('session-123');
```

### Get Session Tree

```sql
-- Get the complete session tree (including forks)
WITH RECURSIVE session_tree AS (
    SELECT id, content, parent_id, 1 as level
    FROM memories
    WHERE id = 'session-123'
    
    UNION ALL
    
    SELECT m.id, m.content, m.parent_id, st.level + 1
    FROM memories m
    JOIN memory_edges e ON m.id = e.target_id
    JOIN session_tree st ON e.source_id = st.id
    WHERE e.relation = 'forked_from'
)
SELECT * FROM session_tree
ORDER BY level, _created_at;
```

## Best Practices

1. **Use Meaningful Metadata**: Store additional context in the message metadata
2. **Keep Messages Atomic**: Each message should represent a single thought or action
3. **Use Forks Judiciously**: Fork when you need to explore alternative paths
4. **Clean Up**: Implement archival for old sessions
5. **Indexing**: Ensure proper indexes on session_id and parent_id for performance

[Next: Search Capabilities →](./search.md)
