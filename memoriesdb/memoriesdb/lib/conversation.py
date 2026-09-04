from typing import Any, Dict, List, Optional, Union, cast
from uuid import uuid4
import logging
import os, time, json, websocket
from memoriesdb.lib.config import STREAM
from memoriesdb.lib import ai, db
logger = logging.getLogger(__name__)

def   is_generator(x): return type(x).__name__ == 'generator'
def wrap_generator(x): return x if is_generator(x) else [ x ]
def is_blank_message(message): return not ( message.get( 'tool_calls' ) or
                                            message.get( 'content'    ) or
                                            message.get( 'images'     ) or
                                            message.get( 'done'       ) )

class EphemeralConversationProxy:
    def __init__(_, uuid, conversation_id, model, include_observer_context=True):
        _.uuid, _.conversation_id, _.model = uuid, conversation_id, model
        _.include_observer_context = include_observer_context
        _.meta = {}
        pass
    pass


def materialize_history(_, include_observer_context=None):
    """this thin wrapper will grow into its own subsystem"""
    # Use object's flag if not explicitly provided
    if include_observer_context is None:
        include_observer_context = getattr(_, 'include_observer_context', False)
    logger.debug("Materializing history include_observer=%s", include_observer_context)
    msgs = db.load_simplified_convo(_.conversation_id, _.uuid)
    logger.debug("Loaded simplified conversation")

    # Track accumulated observer messages for combining with next user message
    observer_buffer = []

    for msg in msgs:
        if msg.get('thinking'):
            del msg['thinking']
            pass
        if msg.get('role') == 'meta':
            try:
                meta = json.loads(msg.get('content') or '{}')
            except Exception:
                meta = {}
            if isinstance(meta, dict):
                _.meta.update(meta)
                if meta.get('model'):
                    _.model = meta['model']
            continue
        if is_blank_message(msg):
            continue

        # Handle observer messages based on flag
        if msg.get('role') == 'observer':
            if include_observer_context:
                # Buffer observer messages to combine with next user message
                logger.debug("Buffering observer message: %s", msg.get('content', '')[:100])
                observer_buffer.append(msg.get('content', ''))
            else:
                # Filter out observer messages
                logger.debug("Filtering observer message: %s", msg.get('content', '')[:100])
                continue
        else:
            # Non-observer message
            if observer_buffer and include_observer_context:
                # Prepend observer context to this message
                observer_context = '\n'.join(f"[Observer: {obs}]" for obs in observer_buffer)
                msg['content'] = f"{observer_context}\n\n{msg.get('content', '')}"
                observer_buffer = []
            yield msg
            pass

    # If we have leftover observer messages at the end, discard them
    # (no user message to attach them to)
    if observer_buffer:
        logger.debug("Discarding %d observer messages with no following user message", len(observer_buffer))

    logger.debug("Finished materializing history")
    return


def _build_history_record(_, seq, **kw):
    kw['seq'] = seq
    kw['kind'] = 'history'
    return seq + 1, kw


def _save_history_record(_, record):
    memory_id = db.create_memory(conversation_id=_.conversation_id, user_id=_.uuid, **record)
    db.create_memory_edge(memory_id, _.conversation_id, 'belongs_to')
    return memory_id


def read_messages(llm_messages):
    n = -1
    try:
        for n, msg in enumerate(llm_messages):
            yield msg
    except Exception:
        logger.exception("LLM ERROR after chunk index=%s", n)
        pass

def chat_round(_, content='', role='user', stream=None, turn_id=None, max_tokens=0):
    is_prefill = (max_tokens == 1)
    turn_id = turn_id or str(uuid4())
    user_kwargs = {}
    if 'IMAGE==>' in content:
        content, image = content.strip().split('IMAGE==>', 1)
        user_kwargs['images'] = [ image ]

    seq, record = _build_history_record(_, 1000, content=content, role=role,
                                   turn_id=turn_id, **user_kwargs)

    if not is_prefill:
        #print("NOT PREFILL: DONT SKIP SAVING USER RECORD %r", content)
        _save_history_record(_, record)
    else:
        logger.warning("PREFILL: SKIP SAVING USER RECORD %r", content)
        #print("PREFILL: SKIP SAVING USER RECORD %r", content)
    yield dict(record)

    assistant_chunks = []

    logger.warning("MODEL %r", _.model)

    messages = list(materialize_history(_))

    if is_prefill:
        prefill_data = dict(role='user', content=content, **user_kwargs)
        logger.warning("PREFILLING %r", prefill_data)
        #print("PREFILLING %r", prefill_data)
        messages.append(prefill_data)
    else:
        #print("NOT PREFILLING")
        pass
    
    while llm_messages:= ai.chat(
            messages=messages,
            model=_.model,
            max_tokens=max_tokens,
            stream=STREAM if stream is None else stream
    ):
        logger.debug("LLM messages source=%r", llm_messages)
        for msg in read_messages(llm_messages):
            if is_prefill:
                #print("LOOOOP", msg)
                pass
            role = msg.message.role
            if role == 'assistant':
                content = msg.message.content
                done = msg.done
                seq, record = _build_history_record(_, seq, content=content, role=role,
                                                   turn_id=turn_id, done=done)

                assistant_chunks.append(content)
                yield dict(record)

                if done:
                    if is_prefill:
                        logger.warning("PREFILL: SKIP LAST SAVE")
                        continue
                    record['content'] = ''.join(assistant_chunks)
                    _save_history_record(_, record)
                    assistant_chunks = []
                pass
            else:
                logger.warning("UNKNOWN MESSAGE ROLE %r", msg.message)
                pass

        logger.info("Assistant round complete")
        return
    pass
