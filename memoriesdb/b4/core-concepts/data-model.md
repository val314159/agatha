# Data Model

## Memories (Nodes)

Memories are the fundamental unit of data in MemoriesDB. Each memory can represent:
- A message in a conversation
- A session or conversation thread
- A piece of metadata or system information

### Memory Structure
```sql
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    _created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    _updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    _deleted_at TIMESTAMPTZ,
    content TEXT,
    content_hash BYTEA,
    content_embedding VECTOR(1024),
    _metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    updated_by TEXT
);
```

## Edges (Relationships)

Edges define relationships between memories. They can represent:
- Message replies
- Session forks
- Hierarchical relationships
- Any custom relationship type

### Edge Structure
```sql
CREATE TABLE memory_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    _created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES memories(id),
    relation TEXT NOT NULL,
    weight FLOAT DEFAULT 1.0,
    _metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

## Common Relationship Types

- `reply_to`: One message is a reply to another
- `forked_from`: A session was forked from another
- `belongs_to`: A memory belongs to a session
- `references`: A memory references another memory
- `related_to`: General relationship between memories

## Example Usage

### Creating a New Memory
```sql
INSERT INTO memories (content, _metadata) 
VALUES ('Hello, world!', '{"type": "message", "sender": "user1"}');
```

### Creating a Relationship
```sql
INSERT INTO memory_edges (source_id, target_id, relation)
VALUES ('memory-1', 'memory-2', 'reply_to');
```

### Querying Related Memories
```sql
-- Find all replies to a message
SELECT m.* 
FROM memories m
JOIN memory_edges e ON m.id = e.target_id
WHERE e.source_id = 'message-id' AND e.relation = 'reply_to';
```

## Best Practices

1. **Use Meaningful Metadata**: Store additional context in the `_metadata` JSONB field
2. **Consistent Naming**: Use consistent relation types across your application
3. **Indexing**: Ensure proper indexes are in place for common query patterns
4. **Partitioning**: Consider partitioning for large datasets

[Next: Pub/Sub System →](./pubsub.md)
