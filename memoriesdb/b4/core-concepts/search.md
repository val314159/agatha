# Search Capabilities

MemoriesDB provides powerful search functionality to help you find and analyze your data efficiently.

## Full-Text Search

Search across all text content in your memories:

```sql
-- Basic full-text search
SELECT * FROM search_memories('database design');

-- Search within a specific session
SELECT * FROM search_memories('mobile UI')
WHERE session_id = 'session-123';
```

### Search Options

- **Prefix Matching**: `'search*'` matches any word starting with "search"
- **Phrase Search**: `"exact phrase"` matches the exact phrase
- **Boolean Operators**: `AND`, `OR`, `NOT` for complex queries
- **Proximity Search**: `'mobile NEAR/3 design'` finds words within 3 words of each other

## Vector Similarity Search

Find semantically similar content using vector embeddings:

```sql
-- Find similar content
SELECT * FROM vector_search(
    your_embedding_function('database design'),  -- Query embedding
    0.7,                                        -- Similarity threshold (0-1)
    10                                           -- Maximum results
);

-- With metadata filtering
SELECT m.*, 1 - (m.content_embedding <=> query.embedding) as similarity
FROM memories m,
     (SELECT your_embedding_function('database design') as embedding) as query
WHERE 1 - (m.content_embedding <=> query.embedding) > 0.7
  AND m._metadata->>'type' = 'message'
ORDER BY similarity DESC
LIMIT 10;
```

## Graph Traversal

Navigate relationships between memories:

```sql
-- Find all replies to a message
WITH RECURSIVE message_thread AS (
    -- Start with the root message
    SELECT m.*, 1 as depth, ARRAY[m.id] as path
    FROM memories m
    WHERE m.id = 'message-123'
    
    UNION ALL
    
    -- Recursively find all replies
    SELECT m.*, mt.depth + 1, mt.path || m.id
    FROM memories m
    JOIN memory_edges e ON m.id = e.target_id
    JOIN message_thread mt ON e.source_id = mt.id
    WHERE e.relation = 'reply_to'
      AND NOT m.id = ANY(mt.path)  -- Prevent cycles
)
SELECT * FROM message_thread
ORDER BY path;
```

## Hybrid Search

Combine multiple search methods for more powerful queries:

```sql
-- Combine vector search with full-text search
WITH vector_results AS (
    SELECT id, 1 - (content_embedding <=> your_embedding_function('database design')) as vector_score
    FROM memories
    WHERE 1 - (content_embedding <=> your_embedding_function('database design')) > 0.6
),
text_results AS (
    SELECT id, ts_rank_cd(to_tsvector('english', content), 
                         plainto_tsquery('english', 'database design')) as text_score
    FROM memories
    WHERE to_tsvector('english', content) @@ plainto_tsquery('english', 'database design')
)
SELECT m.*, 
       COALESCE(v.vector_score, 0) * 0.7 + 
       COALESCE(t.text_score, 0) * 0.3 as combined_score
FROM memories m
LEFT JOIN vector_results v ON m.id = v.id
LEFT JOIN text_results t ON m.id = t.id
WHERE v.id IS NOT NULL OR t.id IS NOT NULL
ORDER BY combined_score DESC
LIMIT 20;
```

## Search Optimization

### Indexing

```sql
-- For full-text search
CREATE INDEX idx_memories_fts ON memories 
USING GIN (to_tsvector('english', content));

-- For vector search
CREATE INDEX idx_memories_embedding ON memories 
USING ivfflat (content_embedding vector_l2_ops)
WITH (lists = 100);

-- For metadata filtering
CREATE INDEX idx_memories_metadata ON memories USING GIN (_metadata);
```

### Query Performance Tips

1. **Use Appropriate Filters**: Narrow down results with metadata filters
2. **Limit Results**: Always use `LIMIT` with search queries
3. **Selective Indexing**: Only index the fields you need to search
4. **Partitioning**: Consider partitioning large tables by date or category
5. **Materialized Views**: Pre-compute common search patterns

## Best Practices

1. **Use the Right Tool**:
   - Full-text for keyword searches
   - Vector search for semantic similarity
   - Graph traversal for relationship exploration

2. **Tune Your Search**:
   - Adjust similarity thresholds based on your data
   - Experiment with different text search configurations
   - Consider language-specific stemming and dictionaries

3. **Monitor Performance**:
   - Use `EXPLAIN ANALYZE` to understand query performance
   - Monitor slow queries
   - Update statistics regularly

[Back to Core Concepts →](../core-concepts/README.md)
