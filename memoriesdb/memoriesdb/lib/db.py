#!/usr/bin/env python3
"""
db.py - Database operations for MemoriesDB

This module provides all database access functions. It consolidates
the previously scattered db_sync.py, db_ll_utils.py, and db_utils.py
into a single coherent database layer.
"""

import os
import re
import json
import logging
import psycopg
from psycopg.rows import dict_row
import numpy as np
import numpy.typing as npt
from typing import Any, Dict, List, Optional, Union
import datetime as dt

from memoriesdb.lib.config import DSN, DSN2, OLLAMA_URL, EMBEDDING_MODEL, DEBUG

logger = logging.getLogger(__name__)

# Module-level variable to store the current user ID
_CURRENT_USER_ID = '00000000-0000-0000-0000-000000000000'

def get_current_user_id() -> Optional[str]:
    """Get the current user ID from memory
    
    Returns:
        Optional[str]: The current user ID or None if not set
    """
    return _CURRENT_USER_ID

def set_current_user_id(user_id: str):
    """Set the current user ID in memory
    
    This sets the user ID in memory, and all subsequent database connections
    will automatically use this user ID for auditing purposes.
    
    Args:
        user_id: UUID string of the user to set as current
    """
    global _CURRENT_USER_ID
    _CURRENT_USER_ID = user_id
    logger.info("Set current user ID to %s", user_id)

def ensure_float32(array: npt.ArrayLike) -> npt.NDArray[np.float32]:
    """Ensure input is a numpy float32 array.
    
    Args:
        array: Input array or array-like object
        
    Returns:
        np.ndarray with dtype=np.float32
        
    Raises:
        ValueError: If input cannot be converted to float32 array
    """
    if not isinstance(array, np.ndarray):
        array = np.asarray(array, dtype=np.float32)
    elif array.dtype != np.float32:
        array = array.astype(np.float32)
    return array

# ----------------------
# Memory Operations
# ----------------------

def get_memories_by_uuid(created_by: str, suffix='') -> List:
    query = """
    SELECT id, turn_id, kind, content, content_hash, content_embedding, _metadata,
           created_by, updated_by
    FROM memories
    WHERE created_by = %s and _deleted_at IS NULL
    """
    if suffix: query += ' ' + suffix
    try:
        conn = psycopg.connect(DSN, row_factory=dict_row)
    except:
        conn = psycopg.connect(DSN2, row_factory=dict_row)
    cursor = conn.cursor()
    cursor.execute(query, (created_by,))
    for row in cursor:
        yield row
    return

def get_memory_by_id(memory_id: str) -> Optional[Dict]:
    """Get a memory by its ID
    
    Args:
        memory_id: UUID of the memory to retrieve
    
    Returns:
        Dictionary with memory fields or None if not found
    """
    query = """
    SELECT id, turn_id, kind, content, content_hash, content_embedding, _metadata,
           created_by, updated_by
    FROM memories
    WHERE id = %s
    """
    conn = psycopg.connect(DSN, row_factory=dict_row)
    cursor = conn.cursor()
    cursor.execute(query, (memory_id,))
    ret = cursor.fetchone()
    if ret is None:
        return None
    metadata = ret.pop('_metadata')
    ret.update(metadata)
    return ret

def get_edges_by_source(edge_id: str) -> Optional[Dict]:
    conn = psycopg.connect(DSN, row_factory=dict_row)
    cursor = conn.cursor()
    query = """
    SELECT id, source_id, target_id, relation,
    strength, confidence, _metadata, created_by, updated_by
    FROM memory_edges
    WHERE source_id = %s
    """
    cursor.execute(query, (edge_id,))
    for row in cursor:
        yield row

def get_memories_by_target(memory_id: str, user_id: str, suffix: str=''):
    conn = psycopg.connect(DSN, row_factory=dict_row)
    cursor = conn.cursor()
    query = """
    SELECT id, turn_id, kind, content, content_hash, content_embedding,
           _metadata, created_by, updated_by
    FROM memories
    WHERE id IN (
      SELECT source_id FROM memory_edges WHERE target_id = %s
    ) AND created_by = %s
    """ + suffix
    cursor.execute(query, (memory_id, user_id))
    for row in cursor:
        row.update(row.pop('_metadata'))
        yield row

def get_edges_by_target(edge_id: str) -> Optional[Dict]:
    conn = psycopg.connect(DSN, row_factory=dict_row)
    cursor = conn.cursor()
    query = """
    SELECT id, source_id, target_id, relation,
    strength, confidence, _metadata, created_by, updated_by
    FROM memory_edges
    WHERE target_id = %s
    """
    cursor.execute(query, (edge_id,))
    for row in cursor:
        yield row

def get_edge_by_id(edge_id: str) -> Optional[Dict]:
    """Get an edge by its ID
    
    Args:
        edge_id: UUID of the memory edge to retrieve
    
    Returns:
        Dictionary with memory edge fields or None if not found
    """
    query = """
    SELECT id, source_id, target_id, relation,
    strength, confidence, _metadata, created_by, updated_by
    FROM memory_edges
    WHERE id = %s
    """
    conn = psycopg.connect(DSN, row_factory=dict_row)
    cursor = conn.cursor()
    cursor.execute(query, (edge_id,))
    ret = cursor.fetchone()
    if ret:
        ret.update(ret.pop('_metadata'))
    return ret

def create_memory(
    content: str, 
    user_id: Optional[str] = None,
    kind: Optional[str] = None,
    metadata: Optional[dict] = None,
    content_embedding: Optional[npt.ArrayLike] = None,
    conn=None,
    **kw
) -> str:
    logger.debug("CM0")
    own_conn = conn is None
    if own_conn:
        conn = psycopg.connect(DSN)
    logger.debug("CM1")
    cursor = conn.cursor()
    logger.debug("CM2")
    if not content:
        content = ''
    logger.debug("CM3 %r", content)
    if type(metadata) == dict:
        logger.debug("CM3.T")
        metadata.update(kw)
    else:
        logger.debug("CM3.F")
        metadata = kw
    logger.debug("CM4 %r", metadata)
    turn_id = kw.pop('turn_id', None)
    if turn_id is None and isinstance(metadata, dict):
        turn_id = metadata.get('turn_id')
    query = """
    INSERT INTO memories (
        turn_id,
        content, 
        kind, 
        _metadata, 
        content_embedding,
        created_by, 
        updated_by)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    RETURNING id
    """
    logger.debug("CM5")
    params = (
        turn_id,
        content,
        kind,
        psycopg.types.json.Jsonb(metadata) if metadata else '{}',
        Vector(ensure_float32(content_embedding).tolist()) if content_embedding is not None else None,
        user_id,
        user_id
    )
    logger.debug("CM6 cursor=%r query=%s params=%r", cursor, query, params)
    try:
        cursor.execute(query, params)
    except Exception:
        logger.exception("CMERR")
        if own_conn:
            conn.rollback()
        raise
    logger.debug("CM7")
    record_uuid = cursor.fetchone()[0]
    logger.debug("CM8")
    if own_conn:
        conn.commit()
    logger.debug("CM9")
    if own_conn:
        conn.close()
    return record_uuid

def create_memory_edge(
    source_id: str, 
    target_id: str, 
    relation: str,
    strength: Optional[float] = None,
    confidence: Optional[float] = None,
    metadata: Optional[dict] = None,
    conn=None
) -> str:
    """Create a directed edge between two memories
    
    Args:
        source_id: Source memory UUID
        target_id: Target memory UUID
        relation: Type of relationship (lowercase with underscores)
        strength: Optional strength of the relationship (-1.1 to 1.1)
        confidence: Optional confidence level (0.0 to 1.0)
        metadata: Optional JSON metadata
        
    Returns:
        The UUID of the newly created edge
        
    Raises:
        ValueError: If source_id equals target_id (self-reference)
    """
    if source_id == target_id:
        raise ValueError("Cannot create self-referential edge")
    
    user_id = get_current_user_id()
    if not user_id:
        raise ValueError("No current user set. Call set_current_user_id() first.")
    own_conn = conn is None
    if own_conn:
        conn = psycopg.connect(DSN)
    cursor = conn.cursor()
    query = """
    INSERT INTO memory_edges (
        source_id,
        target_id,
        relation,
        strength,
        confidence,
        _metadata,
        created_by,
        updated_by)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING id
    """
    params = (
        source_id, 
        target_id, 
        relation,
        strength,
        confidence,
        psycopg.types.json.Jsonb(metadata) if metadata else '{}',
        user_id,
        user_id
    )
    try:
        cursor.execute(query, params)
        result = cursor.fetchone()
        if not result:
            raise ValueError("Failed to create memory: no ID returned")
        if own_conn:
            conn.commit()
        return result[0]
    except Exception as e:
        if own_conn:
            conn.rollback()
        logger.error("Error creating memory: %s", e)
        raise
    finally:
        if own_conn:
            conn.close()

def create_event(
    turn_id: str,
    event_kind: str,
    content: str = '',
    user_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    conn=None,
    **kw
) -> str:
    own_conn = conn is None
    if own_conn:
        conn = psycopg.connect(DSN)
    if type(metadata) == dict:
        metadata.update(kw)
    else:
        metadata = kw
    uid = user_id or get_current_user_id()
    cursor = conn.cursor()
    query = """
    INSERT INTO events (
        turn_id,
        kind,
        content,
        _metadata,
        created_by,
        updated_by)
    VALUES (%s, %s, %s, %s, %s, %s)
    RETURNING id
    """
    params = (
        turn_id,
        event_kind,
        content,
        psycopg.types.json.Jsonb(metadata) if metadata else '{}',
        uid,
        uid,
    )
    try:
        cursor.execute(query, params)
        event_id = cursor.fetchone()[0]
        if own_conn:
            conn.commit()
        return str(event_id)
    except Exception:
        if own_conn:
            conn.rollback()
        raise
    finally:
        if own_conn:
            conn.close()

def check_valid_uuid(uuid):
    conn = psycopg.connect(DSN)
    cursor = conn.cursor()
    password = os.getenv('USER_PASSWORD', 'el passwordo')
    try:        
        cursor.execute("SELECT md5(%s)=digest FROM users"
                       " WHERE users.id=%s LIMIT 1",
                       (password, uuid))
        if row:= cursor.fetchone():
            if row[-1]:
                logger.info("PASSWORD MATCH, USER IS GOOD!")
                return uuid
            else:
                logger.warning("PASSWORD MISMATCH")
                raise SystemExit(6)
        else:
            logger.warning("user not found! %s", uuid)
            raise SystemExit(5)
    except psycopg.errors.InvalidTextRepresentation:
        logger.error("Invalid UUID provided: %s", uuid)
        raise SystemExit(4)

# ----------------------
# Conversation Operations
# ----------------------

def load_simplified_convo(convo_id, user_id, reverse=False):
    return simplify_convo(load_convo(convo_id, user_id, reverse))

def simplify_convo(convo):
    """
    turns a complex array of dicts
    into the minumum we need to send to the context window
    """
    for msg in convo:
        kind = msg.get('kind')
        if kind == 'history':
            data = dict(role=msg['role'],
                        content=msg['content'])
            done = msg.get('done', None)
            if done is not None:
                data['done'] = done
            if role:= msg.get('role'):
                data['role'] = role
            if images:= msg.get('images'):
                data['images'] = images
            if tool_name:= msg.get('tool_name'):
                data['tool_name'] = tool_name
            if tool_calls:= msg.get('tool_calls'):
                data['tool_calls'] = tool_calls
            if thinking:= msg.get('thinking'):
                data['thinking'] = thinking
            if turn_id:= msg.get('turn_id'):
                data['turn_id'] = str(turn_id)
            yield data
        elif kind == 'session':
            pass
        else:
            raise Exception("Unknown message kind")

def load_convo(suid, user_id, reverse=False):
    convo = get_memory_by_id(suid)
    suffix = ' ORDER BY ID DESC ' if reverse else ''
    return get_memories_by_target(convo['id'], user_id, suffix)

def store_convo(history, title, user_id=None, conn=None):
    logger.debug("SC0")
    uuid = user_id or get_current_user_id()
    logger.debug("SC1")
    suid = create_memory(title, uuid, kind='convo', conn=conn)
    logger.debug("SC1.9")
    logger.debug("SC2")
    for h in history:
        h['user_id'] = uuid
        h['active'] = True
        muid = create_memory(conn=conn, **h)
        euid = create_memory_edge(muid, suid, 'belongs_to', conn=conn)
    logger.debug("SC9")
    return suid

def _make_meta_history(model: Optional[str] = None, meta: Optional[Dict[str, Any]] = None):
    payload: Dict[str, Any] = {}
    if isinstance(meta, dict):
        payload.update(meta)
    if model:
        payload.setdefault('model', model)
    if not payload:
        return []
    return [dict(role='meta', content=json.dumps(payload), kind='history')]

def get_user_conversations(uuid):
    return get_memories_by_uuid(uuid, " AND kind='convo'")

def slugify(value: str) -> str:
    value = (value or '').strip().lower()
    value = re.sub(r'[^a-z0-9\s_-]+', '', value)
    value = re.sub(r'[\s_-]+', '-', value)
    return value.strip('-')

def save_template(
    system_prompt: str,
    name: Optional[str] = None,
    slug: Optional[str] = None,
    model: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
    title_template: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a conversation template row and return its identifying fields."""
    prompt = (system_prompt or '').strip()
    if not prompt:
        raise ValueError("system_prompt is required")
    display_name = (name or prompt.splitlines()[0][:80] or 'Untitled Prompt').strip()
    slug_value = slugify(slug or display_name)
    meta_value = meta or {}
    if not slug_value:
        raise ValueError("name or slug must produce a valid slug")
    conn = psycopg.connect(DSN, row_factory=dict_row)
    try:
        with conn.cursor() as cursor:
            cursor.execute("LOCK TABLE prompt_templates IN EXCLUSIVE MODE")
            cursor.execute(
                """
                SELECT id, slug, name, version, title_template, system_prompt, model, meta, active
                FROM prompt_templates
                WHERE slug = %s
                ORDER BY version DESC
                LIMIT 1
                """,
                (slug_value,),
            )
            latest = cursor.fetchone()
            if latest:
                latest = dict(latest)
                unchanged = (
                    latest.get('name') == display_name and
                    latest.get('title_template') == title_template and
                    latest.get('system_prompt') == prompt and
                    latest.get('model') == model and
                    (latest.get('meta') or {}) == meta_value
                )
                if unchanged:
                    latest['id'] = str(latest['id'])
                    return {
                        'id': latest['id'],
                        'slug': latest['slug'],
                        'name': latest['name'],
                        'version': latest['version'],
                        'model': latest['model'],
                        'meta': latest.get('meta') or {},
                        'active': latest['active'],
                    }
            cursor.execute(
                "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM prompt_templates WHERE slug = %s",
                (slug_value,),
            )
            next_version = int(cursor.fetchone()['next_version'])
            cursor.execute(
                """
                INSERT INTO prompt_templates
                    (slug, version, name, title_template, system_prompt, model, meta, created_by, updated_by)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                RETURNING id, slug, name, version, model, meta, active
                """,
                (
                    slug_value,
                    next_version,
                    display_name,
                    title_template,
                    prompt,
                    model,
                    json.dumps(meta_value),
                    user_id,
                    user_id,
                ),
            )
            row = dict(cursor.fetchone())
            if row.get('id') is not None:
                row['id'] = str(row['id'])
        conn.commit()
        return row
    finally:
        conn.close()

def get_template(template: str) -> Optional[Dict[str, Any]]:
    """Fetch an active prompt template by slug or id."""
    value = (template or '').strip()
    if not value:
        return None
    conn = psycopg.connect(DSN, row_factory=dict_row)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, slug, name, version, title_template, system_prompt, model, meta, active
                FROM prompt_templates
                WHERE active = TRUE AND (slug = %s OR id::text = %s)
                ORDER BY version DESC
                LIMIT 1
                """,
                (value, value),
            )
            row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def create_convo_from_template(
    template: str,
    user_id: Optional[str] = None,
    title: Optional[str] = None,
    model: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
    conn=None,
) -> tuple:
    """Create a conversation from a stored prompt template with optional overrides."""
    rec = get_template(template)
    if not rec:
        raise ValueError(f"template not found: {template}")
    base_meta = rec.get('meta') if isinstance(rec.get('meta'), dict) else {}
    merged_meta = dict(base_meta)
    merged_meta.update(
        template_id=str(rec['id']),
        template_slug=rec['slug'],
        template_version=rec['version'],
    )
    if isinstance(meta, dict):
        merged_meta.update(meta)
    new_title = title or rec.get('title_template')
    new_model = model or rec.get('model')
    prompt_text = (rec.get('system_prompt') or '').strip()
    if not prompt_text:
        raise ValueError(f"template has no system_prompt: {template}")
    ts = str(dt.datetime.now(dt.UTC))[:19]
    convo_title = new_title or ("NewSession" + ts.replace(' ', 'T'))
    history = _make_meta_history(model=new_model, meta=merged_meta)
    history.append(dict(role='system', content=prompt_text, kind='history'))
    convo_id = store_convo(history, convo_title, user_id, conn=conn)
    return str(convo_id), convo_title

def create_convo_without_prompt(
    user_id: Optional[str] = None,
    title: Optional[str] = None,
    model: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
    conn=None,
) -> tuple:
    """Create a conversation with no initial history messages."""
    ts = str(dt.datetime.now(dt.UTC))[:19]
    new_title = title or ("NewSession" + ts.replace(' ', 'T'))
    convo_id = store_convo(_make_meta_history(model=model, meta=meta), new_title, user_id, conn=conn)
    return str(convo_id), new_title

def save_convo_round(
    convo_id: str,
    user_id: str,
    messages: List[Dict[str, Any]],
) -> List[str]:
    """Persist one or more conversation history messages to an existing convo."""
    conn = psycopg.connect(DSN)
    created_ids: List[str] = []
    try:
        with conn.transaction():
            for message in messages:
                payload = dict(message)
                payload.setdefault('kind', 'history')
                payload['conversation_id'] = convo_id
                payload['user_id'] = user_id
                memory_id = create_memory(conn=conn, **payload)
                create_memory_edge(memory_id, convo_id, 'belongs_to', conn=conn)
                created_ids.append(str(memory_id))
        return created_ids
    finally:
        conn.close()

def delete_conversation(convo_id: str, user_id: str) -> int:
    """Soft delete a conversation and its messages for a given user.

    Returns:
        Number of rows marked deleted.
    """
    conn = psycopg.connect(DSN)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE memories
                SET _deleted_at = NOW()
                WHERE created_by = %s
                  AND _deleted_at IS NULL
                  AND (id = %s OR _metadata->>'conversation_id' = %s)
                """,
                (user_id, convo_id, convo_id),
            )
            rowcount = cursor.rowcount
        conn.commit()
        return rowcount
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def get_last_conversation(uuid):
    suffix = " AND kind='convo' ORDER BY id DESC LIMIT 1"
    for row in get_memories_by_uuid(uuid, suffix):
        logger.info("Loading Conversation %s: %s", row['id'], row['content'])
        return row

def get_or_create_last_conversation_locked(user_id: str, template_name: Optional[str] = None):
    """Return latest convo; auto-create from the requested template under per-user row lock."""
    if template_name is None:
        template_name = 'default'
    conn = psycopg.connect(DSN)
    try:
        with conn.transaction():
            with conn.cursor() as cur:
                # Serialize bootstrap creation per user (not global).
                cur.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (user_id,))
                cur.execute(
                    """
                    SELECT id, content
                    FROM memories
                    WHERE created_by = %s AND kind = 'convo'
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (user_id,)
                )
                row = cur.fetchone()
                if row:
                    return dict(id=str(row[0]), content=row[1])

                if not template_name:
                    return None

                logger.info("[convo-bootstrap] creating from template=%s user_id=%s", template_name, user_id)
                try:
                    convo_id, title = create_convo_from_template(template_name, user_id, conn=conn)
                except Exception as e:
                    logger.exception("[convo-bootstrap] create failed template=%s user_id=%s error=%r", template_name, user_id, e)
                    raise
                logger.info("[convo-bootstrap] created convo_id=%s title=%s", convo_id, title)
                return dict(id=str(convo_id), content=title)
    finally:
        conn.close()

# ----------------------
# Embedding Operations
# ----------------------

def generate_embedding(text: str) -> List[float]:
    """Generate a normalized embedding vector for the given text
    
    Args:
        text: The text to generate an embedding for
        
    Returns:
        List of floats representing the normalized embedding vector (unit length)
    """
    try:
        import ollama
        has_ollama = True
    except ImportError:
        logger.warning("Ollama not available. Using debug mode for embeddings")
        has_ollama = False
    
    if DEBUG and not has_ollama:
        import random
        import math
        
        raw_vector = [random.uniform(-1, 1) for _ in range(1536)]
        norm = math.sqrt(sum(x*x for x in raw_vector))
        return [x/norm for x in raw_vector]
    
    try:
        response = ollama.embed(model=EMBEDDING_MODEL, prompt=text)
        import math
        raw_vector = response['embedding']
        norm = math.sqrt(sum(x*x for x in raw_vector))
        return [x/norm for x in raw_vector]
    except Exception as e:
        logger.error("Error generating embedding: %s", e)
        raise

# ----------------------
# Search Operations
# ----------------------

def search_memories_vector(
    query_embedding: npt.ArrayLike,
    user_id: Optional[str] = None,
    limit: int = 10,
    similarity_threshold: float = 0.7) -> List[Dict[str, Any]]:
    """Search memories by vector similarity using normalized vectors
    
    This function uses the <#> operator (negative inner product) which is optimized 
    for normalized vectors. The similarity is the negative of this value, which 
    provides a value from -1 (opposite vectors) to 1 (identical vectors).
    
    Args:
        query_embedding: Normalized vector embedding of the search query (must be unit length)
        user_id: Optional user ID to filter results by created_by
        limit: Maximum number of results to return
        similarity_threshold: Minimum similarity threshold (-1 to 1 scale, where 1 is identical).
                             Higher values return fewer but more relevant results.
        
    Returns:
        List of memories matching the query, sorted by decreasing similarity
    """
    query_embedding = ensure_float32(query_embedding)
    query_embedding_list = query_embedding.tolist()
    
    query = """
    WITH similarity_calc AS (
        SELECT id, content, content_hash, created_by, updated_by,
               (content_embedding <#> %s) * -1 as similarity
        FROM memories
        WHERE content_embedding IS NOT NULL
        AND _deleted_at IS NULL
    """
    
    params = [query_embedding_list]
    
    if user_id:
        query += " AND created_by = %s"
        params.append(user_id)
    
    query += """
    )
    SELECT * FROM similarity_calc
    WHERE similarity > %s
    ORDER BY similarity DESC
    LIMIT %s
    """
    
    params.extend([similarity_threshold, limit])
    
    conn = psycopg.connect(DSN, row_factory=dict_row)
    cursor = conn.cursor()
    cursor.execute(query, tuple(params))
    results = cursor.fetchall()
    
    for result in results:
        if 'similarity' in result:
            result['similarity'] = float(result['similarity'])
    
    return results

def semantic_search(query: str, user_id: Optional[str] = None, limit: int = 10, similarity_threshold: float = 0.7) -> List[Dict[str, Any]]:
    """Search memories using semantic similarity
    
    Args:
        query: The search query text
        user_id: Optional user ID to filter results
        limit: Maximum number of results
        similarity_threshold: Minimum similarity threshold (-1 to 1 scale, where 1 is identical)
                             Higher values return fewer but more relevant results
        
    Returns:
        List of matching memories with similarity scores
    """
    query_embedding = generate_embedding(query)
    results = search_memories_vector(
        query_embedding=query_embedding,
        user_id=user_id,
        limit=limit,
        similarity_threshold=similarity_threshold
    )
    return results
