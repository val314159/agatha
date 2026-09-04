#!/usr/bin/env python3
from gevent import monkey as _;_.patch_all()
import os, gevent
import logging
#from memoriesdb.lib.logging_setup import setup_logger as _;_(__file__, level=logging.ERROR)
from memoriesdb.lib.logging_setup import setup_logger as _;_(__file__, level=logging.WARNING)
from memoriesdb.lib.subagent import SubAgentBase, OUT_CHANNEL
from memoriesdb.lib.conversation import EphemeralConversationProxy as ESP, chat_round
from pidwatcher import PidFileWatcher, write_pid_file, basename

logger = logging.getLogger(__name__)


class Convo(SubAgentBase):

    def __init__(_, model=os.getenv('MODEL', 'llama3.1')):
        logger.error("USING MODEL %s", model)
        _.model, _.models, _.children = model, dict(), dict()
        return

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
            for msg in chat_round(sess, content, **chat_kwargs):
                _.publish(tgt_channel, msg)
                pass
            del _.children[key]
            return
        _.children[key] = gevent.spawn(bg_pub)
        return

    pass


if __name__ == '__main__':
    PidFileWatcher(os.getenv("HUB_READY_FILE", "hub.ready")).wait()
    Convo().main()
