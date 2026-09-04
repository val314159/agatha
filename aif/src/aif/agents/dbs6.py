#!/usr/bin/env python3
from gevent import monkey as _;_.patch_all()
import json
import os
from uuid import uuid4
import logging
from ..lib.subagent import SubAgentBase, OUT_CHANNEL
#from memoriesdb.lib.logging_setup import setup_logger as _;_(__file__, level=logging.INFO)
from memoriesdb.lib.db import get_user_conversations, load_simplified_convo, create_event
from memoriesdb.lib.db import delete_conversation, save_convo_round
from memoriesdb.lib.db import create_convo_without_prompt
from memoriesdb.lib.db import save_template, create_convo_from_template
from pidwatcher import PidFileWatcher, write_pid_file, basename

logger = logging.getLogger(__name__)

def send(ws, msg):
    return ws.send( json.dumps(msg) )

def mesg(method, **params):
    return dict(method=method, params=params)

def pub(ws, channel, content='', **kw): 
    ws.send(channel)
    return send(ws, mesg('pub',
                         channel = channel,
                         content = content, **kw))

class DbSvr(SubAgentBase):
    def initialize(_, params):
        ready_path = write_pid_file('dbs.ready')
        logger.info("Saved %s", ready_path)
        pass
    
    def _pub(_, content, uuid, conversation=None, *args, **kw):
        logger.info("PUB %s", (content, uuid, (args, kw)))
        session_id = kw.get('session_id')
        turn_id = kw.get('turn_id') or str(uuid4())
        logger.info("SESS ID %s", session_id)
        tgt_channel = OUT_CHANNEL
        if session_id:
            tgt_channel += '::'
            tgt_channel += session_id
            pass
        create_event(turn_id, 'dbs_request', content=content, user_id=uuid,
                     conversation=conversation, channel=tgt_channel)
        results = []
        if   content=='listConvos':
            for row in get_user_conversations(uuid):
                logger.debug("Conversation row=%r", row)
                logger.info("Conversation %s: %s", row['id'], row['content'])
                results.append([str(row['id']), row['content']])
        elif content== 'shortHistory':
            logger.info("LOAD SHORT HISTORY uuid=%s conversation=%s", uuid, conversation)
            if not conversation:
                # User has no conversations yet
                logger.info("No conversation found, returning empty history")
                pub(_.ws(), tgt_channel, content, results=[], turn_id=turn_id)
            else:
                for row in load_simplified_convo(conversation, uuid, True):
                    row.pop('thinking', '')
                    logger.debug("History row=%r", row)
                    if row['content'] or row['done'] or row.get('images'):
                        results.append(row)
                        if len(results) >= 16:
                            pub(_.ws(), tgt_channel, content, results=results, turn_id=turn_id)
                            results = []
                            pass
                        pass
                    pass
        elif content== 'newConvo':
            template = kw.get('template') or 'default'
            title = kw.get('title')
            no_prompt = bool(kw.get('noprompt'))
            model = kw.get('model')
            meta = kw.get('meta')
            if no_prompt:
                conv_id, title = create_convo_without_prompt(uuid, title=title, model=model, meta=meta)
            else:
                conv_id, title = create_convo_from_template(template, uuid, title=title, model=model, meta=meta)
            results.append(str(conv_id))
        elif content== 'saveTemplate':
            row = save_template(
                system_prompt=kw.get('system_prompt'),
                name=kw.get('name'),
                slug=kw.get('slug'),
                model=kw.get('model'),
                meta=kw.get('meta'),
                title_template=kw.get('title_template'),
                user_id=uuid,
            )
            results.append(row)
        elif content== 'delConvo':
            conv_id = kw.get('conversation_id')
            if conv_id:
                try:
                    delete_conversation(conv_id, uuid)
                    results.append(str(conv_id))
                    logger.info("Soft deleted conversation %s", conv_id)
                except Exception as e:
                    err = f"Error deleting conversation {conv_id}: {e}"
                    logger.error(err)
                    create_event(turn_id, 'dbs_error', content=content, user_id=uuid,
                                 conversation=conversation, error=err)
                    pub(_.ws(), tgt_channel, content, error=err, results=[], turn_id=turn_id)
                    return
            else:
                err = "conversation_id required"
                logger.error(err)
                create_event(turn_id, 'dbs_error', content=content, user_id=uuid,
                             conversation=conversation, error=err)
                pub(_.ws(), tgt_channel, content, error=err, results=[], turn_id=turn_id)
                return
        elif content== 'saveConvoRound':
            conv_id = kw.get('conversation_id') or conversation
            messages = kw.get('messages')
            if messages is None and kw.get('message') is not None:
                messages = [kw.get('message')]
            if not conv_id:
                err = "conversation_id required"
                logger.error(err)
                create_event(turn_id, 'dbs_error', content=content, user_id=uuid,
                             conversation=conversation, error=err)
                pub(_.ws(), tgt_channel, content, error=err, results=[], turn_id=turn_id)
                return
            if not isinstance(messages, list) or not messages:
                err = "messages must be a non-empty list"
                logger.error(err)
                create_event(turn_id, 'dbs_error', content=content, user_id=uuid,
                             conversation=conversation, error=err)
                pub(_.ws(), tgt_channel, content, error=err, results=[], turn_id=turn_id)
                return
            try:
                results.extend(save_convo_round(conv_id, uuid, messages))
                logger.info("Saved %s messages to conversation %s", len(results), conv_id)
            except Exception as e:
                err = f"Error saving conversation round {conv_id}: {e}"
                logger.error(err)
                create_event(turn_id, 'dbs_error', content=content, user_id=uuid,
                             conversation=conversation, error=err)
                pub(_.ws(), tgt_channel, content, error=err, results=[], turn_id=turn_id)
                return
        else:
            err = f"Unknown dbs6 command: {content!r}"
            logger.error(err)
            create_event(turn_id, 'dbs_error', content=content, user_id=uuid,
                         conversation=conversation, error=err)
            pub(_.ws(), tgt_channel, content, error=err, results=[], turn_id=turn_id)
            return
        create_event(turn_id, 'dbs_response', content=content, user_id=uuid,
                     conversation=conversation, result_count=len(results))
        pub(_.ws(), tgt_channel, content, results=results, turn_id=turn_id)
        return
    pass

if __name__ == '__main__':
    PidFileWatcher("pubsub.ready").wait()
    DbSvr().main()
