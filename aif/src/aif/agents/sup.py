#!/usr/bin/env python3
from aif.lib.wsutil import *
from aif.lib.logging_setup import setup_logger as _;_(__file__)
from dataclasses import dataclass, field
from pidwatcher import PidFileWatcher, write_pid_file, basename
import logging

logger = logging.getLogger(__name__)
#logger.setLevel(logging.ERROR)


AI_IN_CHANNEL = os.getenv('AI_IN_CHANNEL', 'llm6-in')
AI_OUT_CHANNEL = os.getenv('AI_OUT_CHANNEL', 'llm6-out')
IN_CHANNELS = f'sup-in,{AI_OUT_CHANNEL},aud-out,img-out'
OUT_CHANNEL = 'sup-out'

THINKING_FILLER_DELAY_SECS = float(os.getenv('THINKING_FILLER_DELAY_SECS', '1.75'))
THINKING_FILLER_FOLLOWUP_DELAY_SECS = float(os.getenv('THINKING_FILLER_FOLLOWUP_DELAY_SECS', '7.0'))
SUP_DEBUG = os.getenv('SUP_DEBUG', '1').strip().lower() not in {'0', 'false', 'no', 'off'}
THINKING_FILLERS = [
    'Hmm.',
    'Let me see.',
    'Okay.',
    'One sec.',
    'All right.',
    'Let me think.',
]
THINKING_FILLERS_FOLLOWUP = [
    'Still thinking.',
    'One more sec.',
    'Hang on.',
    'ummmm'
]

def dbg(event, **kw):
    if not SUP_DEBUG:
        return
    details = ' '.join(f'{k}={v!r}' for k, v in kw.items())
    if details:
        logger.info("[sup] %s %s", event, details)
    else:
        logger.info("[sup] %s", event)

@dataclass
class TurnState:
    msg: dict
    turn_id: str
    session_id: str
    ch: str
    aux: dict
    state: str = 'waiting_ai'
    voice_enabled: bool = False
    ai_chunks: list = field(default_factory=list)
    filler_sent: bool = False
    filler_followup_sent: bool = False
    filler_timer: object = None
    filler_followup_timer: object = None

    def transition(self, new_state, *, reason=''):
        old_state = self.state
        self.state = new_state
        dbg('state_change',
            session_id=self.session_id,
            old_state=old_state,
            new_state=new_state,
            reason=reason)

    def cancel_filler(self, *, reason):
        if self.filler_timer is not None:
            dbg('filler_timer_cancel',
                session_id=self.session_id,
                state=self.state,
                reason=reason)
            self.filler_timer.kill()
            self.filler_timer = None
        if self.filler_followup_timer is not None:
            dbg('filler_followup_timer_cancel',
                session_id=self.session_id,
                state=self.state,
                reason=reason)
            self.filler_followup_timer.kill()
            self.filler_followup_timer = None

    def start_filler_timer(self, sock):
        if not self.voice_enabled:
            return

        def maybe_send_filler():
            if self.filler_sent or self.state == 'finished':
                dbg('filler_skipped',
                    session_id=self.session_id,
                    state=self.state,
                    already_sent=self.filler_sent)
                return
            filler = THINKING_FILLERS[int(time.time()) % len(THINKING_FILLERS)]
            self.filler_sent = True
            dbg('filler_send',
                session_id=self.session_id,
                state=self.state,
                filler=filler)
            filler_params = dict(
                role='assistant',
                content=filler,
                uuid=self.msg.get('uuid'),
                session_id=self.session_id,
                conversation=self.msg.get('conversation'),
                turn_id=self.turn_id,
            )
            pub_params(sock, filler_params, channel=self.ch)
            pub_params(sock, self.msg, channel='aud-in', content=filler, done=True, turn_id=self.turn_id)

        def maybe_send_followup_filler():
            if (
                self.filler_followup_sent
                or self.state == 'finished'
            ):
                dbg('filler_followup_skipped',
                    session_id=self.session_id,
                    state=self.state,
                    already_sent=self.filler_followup_sent)
                return
            filler = THINKING_FILLERS_FOLLOWUP[int(time.time()) % len(THINKING_FILLERS_FOLLOWUP)]
            self.filler_followup_sent = True
            dbg('filler_followup_send',
                session_id=self.session_id,
                state=self.state,
                filler=filler)
            filler_params = dict(
                role='assistant',
                content=filler,
                uuid=self.msg.get('uuid'),
                session_id=self.session_id,
                conversation=self.msg.get('conversation'),
                turn_id=self.turn_id,
            )
            pub_params(sock, filler_params, channel=self.ch)
            pub_params(sock, self.msg, channel='aud-in', content=filler, done=True, turn_id=self.turn_id)

        dbg('filler_timer_start',
            session_id=self.session_id,
            state=self.state,
            delay_secs=THINKING_FILLER_DELAY_SECS)
        self.filler_timer = gevent.spawn_later(THINKING_FILLER_DELAY_SECS, maybe_send_filler)
        dbg('filler_followup_timer_start',
            session_id=self.session_id,
            state=self.state,
            delay_secs=THINKING_FILLER_FOLLOWUP_DELAY_SECS)
        self.filler_followup_timer = gevent.spawn_later(
            THINKING_FILLER_FOLLOWUP_DELAY_SECS,
            maybe_send_followup_filler,
        )

    def send_voice_text(self, sock, text, done):
        if not self.voice_enabled:
            return
        if not text:
            return
        logger.info(f"Sending voice text (done={done}): {text}")
        dbg('voice_chunk_send',
            session_id=self.session_id,
            turn_id=self.turn_id,
            state=self.state,
            size=len(text),
            preview=text[:120],
            done=done)
        pub_params(sock, self.msg, channel='aud-in', content=text, done=done, turn_id=self.turn_id)

    def handle_ai_message(self, sock, params):
        dbg('ai_message',
            session_id=self.session_id,
            turn_id=self.turn_id,
            state=self.state,
            role=params.get('role'),
            done=params.get('done'),
            content_preview=(params.get('content') or '')[:80])

        pub_params(sock, dict(params, from_=params.get('channel'), channel=self.ch))

        if params.get('role') != 'assistant':
            return

        #logger.info(f"Assistant message: {params}")

        if self.state == 'waiting_ai':
            self.transition('streaming_ai_before_first_voice_send', reason='first_assistant_chunk')
            self.cancel_filler(reason='first_chunk_received')

        chunk_text = params.get('content', '')
        if chunk_text:
            self.ai_chunks.append(chunk_text)

        # Check for sentence boundaries to send partial voice
        if self.voice_enabled:
            full_text = ''.join(self.ai_chunks)
            # Scan for sentence boundaries (. ! ? followed by space or end)
            for i, char in enumerate(full_text):
                if char in '.!?' and (i + 1 >= len(full_text) or full_text[i + 1] == ' '):
                    # Send text up to this boundary
                    to_send = full_text[:i + 1]
                    remaining = full_text[i + 1:]
                    if to_send:
                        self.send_voice_text(sock, to_send, done=False)
                    # Replace ai_chunks with remaining text
                    self.ai_chunks = [remaining] if remaining else []
                    break

        if params.get('done'):
            if self.voice_enabled:
                # Send any remaining text
                full_text = ''.join(self.ai_chunks).strip()
                if full_text:
                    self.send_voice_text(sock, full_text, done=True)
                self.cancel_filler(reason='voice_completed')
                self.transition('waiting_audio', reason='ai_done')
            else:
                self.cancel_filler(reason='ai_done_no_audio')
                self.transition('finished', reason='ai_done_no_audio')

    def handle_audio_message(self, sock, params):
        dbg('audio_message',
            session_id=self.session_id,
            turn_id=self.turn_id,
            state=self.state,
            done=params.get('done'),
            content_preview=(params.get('content') or '')[:80])
        pub_params(sock, dict(params, from_=params.get('channel'), channel=self.ch))

        if self.state != 'waiting_audio':
            dbg('audio_message_ignored',
                session_id=self.session_id,
                state=self.state,
                reason='not_waiting_audio')
            return

        if params.get('done'):
            self.transition('finished', reason='audio_done')

    def handle_aux_message(self, sock, params):
        dbg('aux_message',
            session_id=self.session_id,
            turn_id=self.turn_id,
            state=self.state,
            channel=params.get('channel'))
        pub_params(sock, dict(params, from_=params.get('channel'), channel=self.ch))

    def finish(self, sock):
        self.cancel_filler(reason='turn_finish')
        pub(sock, self.ch, None, type='end', **self.aux)
        dbg('turn_finish',
            session_id=self.session_id,
            turn_id=self.turn_id,
            state=self.state,
            ai_chunk_count=len(self.ai_chunks),
            ai_chars=sum(len(x) for x in self.ai_chunks))


def turn_session_id(params):
    session_id = params.get('session_id')
    if not session_id:
        return ''
        raise RuntimeError(f"sup: missing session_id in params={params!r}")
    return str(session_id)


def turn_turn_id(params):
    turn_id = params.get('turn_id')
    if not turn_id:
        raise RuntimeError(f"sup: missing turn_id in params={params!r}")
    return str(turn_id)


def route_message(turn, sock, params):
    channel = params.get('channel', '')
    if channel == AI_OUT_CHANNEL or channel.startswith(f'{AI_OUT_CHANNEL}::'):
        turn.handle_ai_message(sock, params)
        return
    if channel == 'aud-out' or channel.startswith('aud-out::'):
        turn.handle_audio_message(sock, params)
        return
    turn.handle_aux_message(sock, params)


def process_turn(sock, msg, session_queues):
    session_id = turn_session_id(msg)
    turn_id = turn_turn_id(msg)
    aux = dict(
        uuid=msg.get('uuid'),
        session_id=session_id,
        conversation=msg.get('conversation'),
        turn_id=turn_id,
    )
    ch = OUT_CHANNEL
    if session_id:
        ch += '::' + session_id

    turn = TurnState(
        msg=msg,
        turn_id=turn_id,
        session_id=session_id,
        ch=ch,
        aux=aux,
        voice_enabled=bool(msg.get('generate_audio')),
    )

    pub(sock, ch, None, type='start', **aux)
    dbg('turn_start',
        session_id=session_id,
        turn_id=turn_id,
        conversation=msg.get('conversation'),
        voice_enabled=turn.voice_enabled,
        content_preview=(msg.get('content') or '')[:120])

    respond_to = AI_OUT_CHANNEL
    dbg('forward_to_llm',
        session_id=session_id,
        turn_id=turn_id,
        channel=AI_IN_CHANNEL,
        respond_to=respond_to,
        stream=True,
        content_preview=(msg.get('content') or '')[:120])
    pub_params(sock, msg, channel=AI_IN_CHANNEL, respond_to=respond_to, stream=True)
    turn.start_filler_timer(sock)

    queue = session_queues.setdefault(turn_id, gevent.queue.Queue())
    while turn.state != 'finished':
        params = queue.get()
        route_message(turn, sock, params)

    turn.finish(sock)


def main():
    in_q = gevent.queue.Queue()
    session_queues = {}
    sock = WebSocket()

    def sock_recv():
        while 1:
            logger.debug("Waiting on socket...")
            msg = recv(sock)
            method = msg.get('method')
            params = msg.get('params', {})
            yield method, params

    def run_turn(turn_msg):
        try:
            process_turn(sock, turn_msg, session_queues)
        finally:
            session_queues.pop(turn_turn_id(turn_msg), None)
            dbg('turn_worker_exit',
                session_id=turn_msg.get('session_id'),
                turn_id=turn_msg.get('turn_id'))

    def read_in_q():
        while 1:
            logger.debug("waiting for next in_q...")
            msg = in_q.get()
            logger.debug(".....................msg %s", msg)

            if 'expression' in msg or 'animation' in msg:
                session_id = turn_session_id(msg)
                aux = dict(
                    uuid=msg.get('uuid'),
                    session_id=session_id,
                    conversation=msg.get('conversation'),
                )
                ch = OUT_CHANNEL + '::' + session_id
                kw = {k: v for k, v in msg.items() if k in ['expression', 'animation']}
                kw.update(aux)
                pub(sock, ch, **kw)
                logger.info("Forwarded to avatar frontend %s", kw)
                continue

            dbg('turn_worker_spawn',
                session_id=msg.get('session_id'),
                turn_id=msg.get('turn_id'))
            gevent.spawn(run_turn, dict(msg))

    gevent.spawn(read_in_q)

    ws_connect(IN_CHANNELS, sock)
    #print("======== 0")
    for method, params in sock_recv():
        #print("======== 1")
        if method == 'initialize':
            #print("INIT", params)
            pass
        elif method == 'pub':
            #print("======== 2")
            #print(">>>>>>>>> PUB", params)
            if params.get('channel') == 'sup-in':
                logger.info("SUP IN %s", params)
                in_q.put(params)
                continue

            turn_id = params.get('turn_id')
            if turn_id and turn_id in session_queues:
                dbg('route_to_turn_queue',
                    session_id=params.get('session_id'),
                    turn_id=turn_id,
                    channel=params.get('channel'),
                    done=params.get('done'))
                session_queues[turn_id].put(params)
            else:
                dbg('unrouted_message',
                    session_id=params.get('session_id'),
                    turn_id=turn_id,
                    channel=params.get('channel'),
                    done=params.get('done'))
                channel = params.get('channel', '')
                if (
                    channel == AI_OUT_CHANNEL
                    or channel.startswith(f'{AI_OUT_CHANNEL}::')
                    or channel == 'aud-out'
                    or channel.startswith('aud-out::')
                ):
                    logger.error("[sup][ERROR] missing or unknown turn_id for routed message: %r", params)
        else:
            logger.error("*" * 80)
            logger.error("ERROR, BAD PACKET %s", dict(method=method, params=params))
            logger.error("*" * 80)
        gevent.sleep(0)

    logger.info("EOF")
    return


if __name__ == '__main__':
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    main()
