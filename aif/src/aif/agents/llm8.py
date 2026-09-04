#!/usr/bin/env python3
from gevent import monkey as _;_.patch_all()
import os, re, gevent, subprocess
import logging
from ..lib.subagent import SubAgentBase, OUT_CHANNEL
#from memoriesdb.lib.logging_setup import setup_logger as _;_(__file__, level=logging.WARNING)
from memoriesdb.lib.conversation import EphemeralConversationProxy as ESP, chat_round
from pidwatcher import PidFileWatcher, write_pid_file, basename

from memoriesdb.lib.filter import filter

logger = logging.getLogger(__name__)


fout_chat1 = open('/tmp/chat1.log', 'w')

class Convo(SubAgentBase):

    def prin(_, *a,**kw):
        if _.max_tokens is None:
            print(*a,**kw, file=fout_chat1, flush=True)

    def __init__(_, model=os.getenv('MODEL', 'llama3.1')):
        logger.error("USING MODEL %s", model)
        _.model, _.models, _.children = model, dict(), dict()
        _.full_content = ''
        return

    def filter_chat_round(_, esp):
        _.prin("====START FILTER")
        full_content = []
        part_content = []
        state, cbuf, tbuf = 0, '', ''
        for msg in esp:
            if msg['role'] != 'assistant':
                continue
            content = msg['content']
            _.prin(content, end='')
            full_content.append(content)
            for ch in content:
                state, cbuf, tbuf = filter(ch, state, cbuf, tbuf)
            if msg.get('done') and state not in (0, 100):
                logger.warning("filter ended mid-tag state=%s, resetting", state)
                state, tbuf = 0, ''
                pass
            msg['content'] = cbuf
            part_content.append(cbuf)
            cbuf = ''
            logger.info("YIELD MSG %s", msg)
            msg['round_done'] = msg['done']
            msg['done'] = False
            yield msg
        _.full_content = ''.join(full_content)
        _.part_content = ''.join(part_content)
        if _.max_tokens is None:
            _.prin("\n====END FILTER")
            _.prin("===FULL CONTENT:\n", _.full_content)
            _.prin("===PART CONTENT:\n", _.part_content)
        return _.extract_tool_calls(''.join(full_content))

    def extract_tool_calls(_, all_content):
        tool_calls = []
        pat1 = re.compile(r'<tool:call(.*?)>(.*?)</tool:call>', re.DOTALL)
        pat2 = re.compile(r'id="([^"]*)"')
        pat3 = re.compile(r'function="([^"]*)"')
        while match := pat1.search(all_content):
            attrs, body = match.groups()
            id_ = pat2.search(attrs).group(1)
            fn_ = pat3.search(attrs).group(1)
            tool_calls.append((id_, fn_, body))
            all_content = all_content[match.end():]
            pass
        return tool_calls

    def fake_speak(_, content, done=False):
        fake_msg = {
            'content': content,
            'role': 'assistant',
            'turn_id': _.turn_id,
            'done': done,
            'seq': 1038,
            'kind': 'history'
        }
        if _.max_tokens is None:
            _.prin(f"FAKE MSG {fake_msg}")
            _.publish(_.tgt_channel, fake_msg)

    TOOL_TMPL = """
--- PROGRAM OUTPUT: TOOL RESULT START ---
function: %s
id: %s
status: %s
%s
--- PROGRAM OUTPUT: TOOL RESULT END ---
"""

    def call_tools(_, tool_calls):
        for tool_id, tool_name, tool_args in tool_calls:
            _.prin(f"Calling tool {tool_name} (id={tool_id}) with args {tool_args}")
            result = subprocess.run(
                [f'tools/{tool_name}'], 
                input=tool_args,
                text=True,
                capture_output=True)
            exitcode = result.returncode
            stdout = result.stdout
            status = "ok" if exitcode == 0 else "error"
            result = _.TOOL_TMPL % (tool_name, tool_id, status, stdout)
            _.prin(f"RESULT {result}\n;;;;;;;;;;;;;;;;;;;;;;;")
            yield result

    def _pub(_, content, uuid, conversation=None, model='', toolset='',
             role='user', channel=OUT_CHANNEL, **kw):
        logger.error("PUB ERR kw %s", kw)
        include_observer_context = kw.get('include_observer_context', True)
        respond_to = kw.get('respond_to')
        session_id = kw.get('session_id')
        turn_id = kw.get('turn_id')
        stream = kw.get('stream')
        max_tokens = kw.get('max_tokens')
        logger.info(
            "LLM INPUT content=%r role=%r uuid=%r conversation=%r turn_id=%r session_id=%r respond_to=%r stream=%r max_tokens=%r",
            content, role, uuid, conversation, turn_id, session_id, respond_to, stream, max_tokens,
        )
        logger.error("SESS ID %s", session_id)
        key = ( uuid, conversation )
        model = model or _.models.get(key) or _.model
        _.models[key] = model
        if kid:= _.children.pop(key, None):
            gevent.kill(kid)
            logger.info("Interrupting current process key=%r greenlet=%r", key, kid)
            pass

        def bg_pub():
            nonlocal content
            tgt_channel = respond_to or OUT_CHANNEL
            if not respond_to and session_id:
                tgt_channel += '::'
                tgt_channel += session_id
                pass
            sess = ESP(uuid, conversation, model,
                       include_observer_context=include_observer_context)
            chat_kwargs = {'role': role, 'stream': stream, 'turn_id': turn_id}
            if max_tokens is not None:
                chat_kwargs['max_tokens'] = max_tokens

            is_prefill = (max_tokens == 1)

            _.tgt_channel = tgt_channel
            _.turn_id = turn_id
            _.max_tokens = max_tokens

            toolcalls = ['T'] # truthy true
            while toolcalls:
                _.prin("START TOOL LOOP")
                #_.fake_speak('fuck you motherfucker! fuck your face all the way to space!')
                round = chat_round(sess, content, **chat_kwargs)
                gen = _.filter_chat_round(round)
                try:
                    while True:
                        _.publish(tgt_channel, next(gen))
                except StopIteration as e:
                    logger.info("StopIteration received, stopping")
                    toolcalls = e.value
                    _.prin(f"STOP ITERATION {repr(toolcalls)}")
                    if is_prefill:
                        if toolcalls:
                            logger.error("WTF WHY ARE THERE TOOLCALLS ON PREFILL?")
                            pass
                        break
                    pass
                _.prin(f"POST PROCESS {is_prefill} {toolcalls}")
                if toolcalls:
                    #_.fake_speak("time to process some goddamn tool calls!")
                    #_.fake_speak("processing tool calls...")
                    results = _.call_tools(toolcalls)
                    content = '\n'.join(results)
                    #_.fake_speak("tool calls processed!")
                    pass
                #_.fake_speak(f"the loop continues and tool calls are {bool(toolcalls)}!")
                _.prin("END TOOL LOOP")
                pass
            _.prin("END ALL LOOPS")
            _.fake_speak("", True)
            #_.fake_speak("we're fucking done!")
            #_.fake_speak("we're so fucking done!", True)
            #_.fake_speak("we're all the way fucking done now!")
            #for n in range(99, 0, -1):
            #    _.fake_speak(f"{n} bottles of beer on the wall; {n} bottles of beer")
            #    _.fake_speak(f"take one down pass it around, {n-1} bottles of beer on the wall")
            del _.children[key]
            return
        _.children[key] = gevent.spawn(bg_pub)
        return

    pass


if __name__ == '__main__':
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    Convo().main()
