from typing import Any, Dict, List, Optional, Union, cast
from uuid import uuid4
import os, time, json, websocket, traceback
from memoriesdb.lib.config import STREAM, THINK, TOOLS
from memoriesdb.lib.logging_setup import get_logger
from memoriesdb.lib import db
from memoriesdb.lib import ai
def pub(ws, channel, content='', **kw):
    ws.send(channel)
    return ws.send(json.dumps(dict(method='pub',
                                   params=dict(channel=channel,
                                               content=content, **kw))))
def   is_generator(x): return type(x).__name__ == 'generator'
def wrap_generator(x): return x if is_generator(x) else [ x ]
def is_blank_message(message): return not ( message.get( 'tool_calls' ) or
                                            message.get( 'content'    ) or
                                            message.get( 'images'     ) or
                                            message.get( 'done'       ) )
def call_tool(funcs, tool_name, **kw):
    print("TOOL CALL", (tool_name, kw))
    try:
        return getattr(funcs, tool_name)(**kw)
    except:
        content = traceback.format_exc()
        print("\\TOOL ERROR", '*'*40)
        print(content)
        print( "/TOOL ERROR", '*'*40)
        return content
    pass
class EphemeralConversationProxy:
    def __init__(_, uuid, conversation_id, funcs, ws, model, tools):
        _.uuid, _.conversation_id, _.funcs = uuid, conversation_id, funcs
        _.ws,   _.model,      _.tools =  ws,  model,      tools
        _.meta = {}
        pass
    pass
def materialize_history(_):
    """this thin wrapper will grow into its own subsystem"""
    print("--------->MATHIST")
    msgs = db.load_simplified_convo(_.conversation_id, _.uuid)
    print("--------->MATHIST2")
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
        yield msg
        #print("===M", msg)
        pass
    return print("<---------")
def append_hist(_, content='', role='user', kind='history', save_memory=True, publish=True, event_kind=None, **kw):
    _.seq += 1
    kw.update(dict(content=content, role=role, kind=kind, seq=_.seq))
    if save_memory:
        muid = db.create_memory(conversation_id=_.conversation_id, user_id=_.uuid, **kw)
        euid = db.create_memory_edge(muid, _.conversation_id, 'belongs_to')
    else:
        muid = euid = None
    if turn_id := kw.get('turn_id'):
        event_kind = event_kind or (
            'llm_chunk' if role == 'assistant' else
            'tool_result' if role == 'tool' else
            'user_message'
        )
        db.create_event(turn_id, event_kind, content=content, user_id=_.uuid,
                        metadata=dict(conversation_id=_.conversation_id, **kw))
    if publish:
        pub(_.ws, _.out_channel, **kw)
    return muid
def ollama_chat(_, stream=STREAM, think=THINK, tools=TOOLS, max_retries=3, retries=0):
    messages = list( materialize_history(_) )
    return ai.chat(messages=messages, model=_.model, stream=stream, think=think,
                   tools=_.tools if tools else None, max_retries=max_retries)
def _respond_to_user(_, done, message, content, tool_calls, **kw):
    if tool_calls:                   kw['tool_calls'] = tool_calls
    if thinking:= getattr(message, 'thinking', ''):  kw[ 'thinking' ] = thinking
    if    done    is not None:       kw[   'done'   ] = done
    if    done:                      kw[ 'autotool' ] = bool(tool_calls)
    return append_hist(_, content=content, role=message.role, fn='respond_to_user', **kw)
def _filter_tool_calls(_, done, message):
    for call in (getattr(message, 'tool_calls', None) or []):
        name, arguments = call.function.name, call.function.arguments
        if name == 'respond_to_user':
            _respond_to_user(_, done, message, arguments['message'], None)
            continue
        yield dict( function=dict( name=name, arguments=arguments ) )
        pass
    pass
def _append_user(_, content, role, **kw):
    _.seq = 999
    if 'IMAGE==>' in content:
        content, image = content.strip().split('IMAGE==>', 1)
        kw['images'] = [ image ]
        pass
    return append_hist(_, content=content, role=role, seq=_.seq, fn='append_user', **kw)
def chat_round(_, content='', channel='', role='user', auto_tool=True, stream=None, turn_id=None):
    if channel: _.out_channel = channel
    turn_id = turn_id or str(uuid4())
    if content: _append_user(_, content=content, role=role, turn_id=turn_id)
    assistant_chunks = []
    tool_calls = [] # keep track of calls we need to do
    while llm_messages:= ollama_chat(_, stream=STREAM if stream is None else stream):
        print("LLM MESSAGES", llm_messages)
        def read_messages():
            n = -1
            try:
                for n, msg in enumerate(llm_messages):
                    yield msg
            except:
                import traceback
                print("\\LLM ERROR", '*'*40)
                traceback.print_exc()
                print( "/LLM ERROR", '*'*40)
                print( "=LLM ERROR", n, n, n, n, n, n, n)
                pass
            pass
        for msg in read_messages():
            funcalls = list( _filter_tool_calls(_, msg.done, msg.message) )
            tool_calls.extend( funcalls )
            if msg.message.role == 'assistant' and msg.message.content:
                assistant_chunks.append(msg.message.content)
            _respond_to_user(_, msg.done, msg.message,
                             msg.message.content, funcalls, scan=1, turn_id=turn_id,
                             save_memory=msg.message.role != 'assistant')
            if msg.done and msg.message.role == 'assistant':
                append_hist(_, content=''.join(assistant_chunks), role='assistant',
                            turn_id=turn_id, save_memory=True, publish=False, event_kind='llm_final')
            pass
        if not auto_tool:
            return print("NO AUTO_TOOL...WE'RE DONE WITH THIS ROUND")
        if not tool_calls:
            return print("NO MORE TOOLS, WE'RE DONE WITH THIS ROUND")
        while tool_calls:
            fn = tool_calls.pop(0)['function']
            content = call_tool(_.funcs, fn['name'], **fn['arguments'])
            append_hist(_, content=content, role='tool', tool_name=fn['name'], turn_id=turn_id)
