#!/usr/bin/env python3
from aif.lib.wsutil import *
from aif.lib.logging_setup import setup_logger as _;_(__file__)
import gevent
import json
import re
import logging
from pidwatcher import PidFileWatcher, write_pid_file, basename


logger = logging.getLogger(__name__)


Req_params_holder = [ None ]


def get_ch(name):
    session_id = Req_params_holder[0].get('session_id')
    out_ch = name + '::' + session_id
    return out_ch


def current_turn_id():
    params = Req_params_holder[0] or {}
    return params.get('turn_id')


def main():
    in_channel = 'aud-in'
    out_channel = 'aud-out'
    out_channel_bin = 'aud-out-bin'
    out_channel_ctl = 'aud-out-ctl'

    MY_URL = "ws://localhost:9009/audiows" # MY = meloyelo

    # Tag patterns
    EXPRESSION_PATTERN = re.compile(r'<<([^>]+)>>')
    ANIMATION_PATTERN = re.compile(r'\[\[([^\]]+)\]\]')

    ws = ws_connect(in_channel)

    my = WebSocket()
    my.connect(f"{MY_URL}")
 
    stream_active = False
    future_content = []
    pending_tags = []  # Tags waiting to be triggered
    current_word_end_ms = 0  # Track current word end time

    def log_pending_phase(phase, content=None, word_end_ms=None):
        tag_values = [t['value'] for t in pending_tags]
        message = f"TAG TRACE phase={phase} pending={tag_values} turn_id={current_turn_id()}"
        if word_end_ms is not None:
            message += f" word_end_ms={word_end_ms}"
        if content is not None:
            message += f" content={content!r}"
        logger.info(message)

    def parse_tags(content):
        """Parse expression and animation tags from content"""
        nonlocal pending_tags
        # Find all tags with their positions
        expressions = list(EXPRESSION_PATTERN.finditer(content))
        animations = list(ANIMATION_PATTERN.finditer(content))
        
        # Add to pending tags with their positions
        for expr in expressions:
            pending_tags.append({
                'type': 'expression',
                'value': expr.group(1),
                'position': expr.start()
            })
        for anim in animations:
            pending_tags.append({
                'type': 'animation',
                'value': anim.group(1),
                'position': anim.start()
            })
        
        # Sort by position
        pending_tags.sort(key=lambda x: x['position'])
        logger.info(f"Parsed {len(pending_tags)} tags: {[t['value'] for t in pending_tags]}")
        if (expressions or animations) and not EXPRESSION_PATTERN.sub('', ANIMATION_PATTERN.sub('', content)).strip():
            logger.warning(f"TAG TRACE phase=parse-tag-only pending={[t['value'] for t in pending_tags]} turn_id={current_turn_id()} content={content!r}")

    def trigger_pending_tags(word_end_ms):
        """Check if any pending tags should be triggered based on word timing"""
        nonlocal pending_tags, current_word_end_ms
        current_word_end_ms = word_end_ms
        
        while pending_tags and pending_tags[0]['position'] < word_end_ms:
            tag = pending_tags.pop(0)
            # Publish to sup-in channel with timing info
            params = {}
            if tag['type'] == 'expression':
                params['expression'] = tag['value']
            else:
                params['animation'] = tag['value']
            
            # Add timing info (position in text, used by JS client to sync with audio)
            params['position'] = tag['position']
            params['time_ms'] = word_end_ms

            params['uuid']         = Req_params_holder[0]['uuid']
            params['session_id']   = Req_params_holder[0]['session_id']
            params['conversation'] = Req_params_holder[0]['conversation']
            params['turn_id']      = current_turn_id()
            
            pub(ws, channel='sup-in', **params)
            log_pending_phase(f"trigger-{tag['type']}", content=tag['value'], word_end_ms=word_end_ms)

    def meloyelo_thread():

        def publish_start():
            nonlocal stream_active
            if stream_active:
                return
            pub(ws,
                channel=out_channel,
                content='start-audio',
                type='audio_pcm',
                uuid         = Req_params_holder[0]['uuid'],
                session_id   = Req_params_holder[0]['session_id'],
                conversation = Req_params_holder[0]['conversation'],
                turn_id      = current_turn_id(),
                done=False)
            stream_active = True

        def publish_finish():
            nonlocal stream_active
            if not stream_active:
                return
            pub(ws,
                channel=out_channel,
                content='finish-audio',
                type='audio_pcm',
                uuid         = Req_params_holder[0]['uuid'],
                session_id   = Req_params_holder[0]['session_id'],
                conversation = Req_params_holder[0]['conversation'],
                turn_id      = current_turn_id(),
                done=True)
            stream_active = False

        while 1:
            try:
                raw = my.recv()
            except Exception as exc:
                logger.info(f"Meloyelo recv error {exc}")
                publish_finish()
                break

            if raw is None:
                continue

            if isinstance(raw, (bytes, bytearray)):
                publish_start()
                pub_raw(ws, get_ch(out_channel_bin), raw)
                continue

            text_frame = raw.strip()
            if not text_frame:
                continue

            if text_frame == 'EOF':
                if pending_tags:
                    logger.error(f"TAG TRACE phase=eof-stuck pending={[t['value'] for t in pending_tags]} turn_id={current_turn_id()} word_end_ms={current_word_end_ms}")
                else:
                    log_pending_phase('eof', word_end_ms=current_word_end_ms)
                pub(ws,
                    channel=get_ch(out_channel_ctl),
                    content='EOF',
                    uuid        = Req_params_holder[0]['uuid'],
                    session_id  = Req_params_holder[0]['session_id'],
                    conversation= Req_params_holder[0]['conversation'],
                    turn_id     = current_turn_id(),
                    )
                publish_finish()
                # queue up the next request
                if future_content:
                    if pending_tags:
                        logger.error(f"TAG TRACE phase=carry-to-next pending={[t['value'] for t in pending_tags]} turn_id={current_turn_id()} next_content={future_content[0].get('content')!r} word_end_ms={current_word_end_ms}")
                    params = future_content.pop(0)
                    Req_params_holder[0] = params
                    my.send(params['content'])
                    pass
                continue

            try:
                payload = json.loads(text_frame)
            except json.JSONDecodeError:
                payload = text_frame

            # Debug: log all JSON payloads
            logger.info(f"JSON payload: {payload}")

            # Check if timing data (word durations)
            # MeloYelo sends a LIST of phoneme/word objects
            if isinstance(payload, list):
                for item in payload:
                    if isinstance(item, dict) and 'word' in item:
                        word_end_ms = item.get('end_ms', 0)
                        if word_end_ms:
                            logger.info(f"Timing data: word='{item.get('word')}', end_ms={word_end_ms}ms")
                            trigger_pending_tags(word_end_ms)
            elif isinstance(payload, dict) and 'word' in payload:
                word_end_ms = payload.get('end_ms', 0)
                if word_end_ms:
                    logger.info(f"Timing data: word='{payload.get('word')}', end_ms={word_end_ms}ms")
                    trigger_pending_tags(word_end_ms)

            publish_start()
            pub(ws,
                channel=get_ch(out_channel_ctl),
                content=payload,
                HELLO = 'THERE',
                uuid         = Req_params_holder[0]['uuid'],
                session_id   = Req_params_holder[0]['session_id'],
                conversation = Req_params_holder[0]['conversation'],
                turn_id      = current_turn_id(),
                )

    def ws_thread():

        while 1:
            logger.info("Waiting on socket...")
            msg = recv(ws)
            logger.info(f"Got {msg} !")

            method = msg.get('method')
            params = msg.get('params',{})

            if method=='initialize':
                logger.info(f"INIT {params}")

            elif method=='pub':
                logger.info(f"PUB {params}")
                content = params['content']
                # Parse tags from content before sending to MeloYelo
                parse_tags(content)
                if stream_active:
                    if pending_tags:
                        log_pending_phase('queue-during-stream', content=content)
                    future_content.append(params)
                else:
                    if pending_tags:
                        log_pending_phase('send-immediate', content=content)
                    Req_params_holder[0] = params
                    my.send(content)
                    logger.info(f"PUB2 {ws, out_channel, True}")

            else:
                logger.info("*"*80)
                logger.info(f"ERROR, BAD PACKET {msg}")
                logger.info("*"*80)
                pass

            gevent.sleep(0)
            pass
        pass

    g1 = gevent.spawn(meloyelo_thread)
    g2 = gevent.spawn(ws_thread)

    gevent.joinall([g1, g2])

if __name__=='__main__':
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    print("GOT IT")
    main()
