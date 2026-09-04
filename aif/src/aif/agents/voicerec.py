#!/usr/bin/env python3
from aif.lib.wsutil import *
from aif.lib.logging_setup import setup_logger as _; _(__file__)
import array
import gevent
import gevent.event
import gevent.queue
import json
import logging
import time
import uuid
from websocket import WebSocket
from pidwatcher import PidFileWatcher, write_pid_file, basename

logger = logging.getLogger(__name__)


IN_CHANNEL = 'vrec-in::'
PREFILL_CHANNEL = 'llm6-prefill'
PULSE_URL = "wss://waves-api.smallest.ai/api/v1/pulse/get_text"
PULSE_API_KEY = "sk_bfda89bea79b4ba78d744dcfc2e45457"
ENERGY_THRESHOLD = 100
CONTINUOUS_DELAY_MS = 1000
ACTIVE_FINALIZE_TIMEOUT_SECS = 3


def build_pulse_url():
    params = [
        ("full_transcript", "true"),
        ("word_timestamps", "true"),
        ("sentence_timestamps", "true"),
        ("language", "en"),
        ("encoding", "linear16"),
        ("sample_rate", "16000"),
        ("api_key", PULSE_API_KEY),
        ("inactivity_timeout", "60"),
    ]
    return PULSE_URL + "?" + "&".join(f"{k}={v}" for k, v in params)


def open_pulse_ws():
    ws = WebSocket()
    ws.connect(build_pulse_url())
    return ws


def has_energy(chunk):
    if not isinstance(chunk, (bytes, bytearray)) or len(chunk) < 2:
        return False
    samples = array.array('h', chunk)
    if not samples:
        return False
    energy = sum(abs(sample) for sample in samples) / len(samples)
    return energy >= ENERGY_THRESHOLD


class SessionStream:
    def __init__(self, session_id, ws):
        self.session_id = session_id
        self.ws = ws
        self.uuid = None
        self.conversation = None
        self.convo_mode = 'active'
        self.closed = False

        self.idle_q = gevent.queue.Queue()
        self.idle_ws = None
        self.idle_reader = gevent.spawn(self.run_idle_reader)
        self.idle_writer = gevent.spawn(self.run_idle_writer)

        self.cont_q = gevent.queue.Queue()
        self.cont_ws = None
        self.cont_reader = gevent.spawn(self.run_cont_reader)
        self.cont_writer = gevent.spawn(self.run_cont_writer)
        self.cont_buffer = []
        self.cont_flush = None

        self.active_q = None
        self.turn_seq = 0
        self.next_seq = 1
        self.pending_packets = {}

        logger.info("[%s] Voice session created", self.session_id)

    def set_meta(self, item):
        if item.get('uuid'):
            self.uuid = item['uuid']
        if item.get('conversation'):
            self.conversation = item['conversation']

    def ensure_idle_ws(self):
        if self.idle_ws is None:
            self.idle_ws = open_pulse_ws()
            logger.info("[%s] Idle PulseSTT connected",
                        self.session_id)

    def close_idle_ws(self):
        if self.idle_ws is None:
            return
        try:
            self.idle_ws.close()
        except Exception:
            pass
        self.idle_ws = None
        logger.info("[%s] Idle PulseSTT closed", self.session_id)

    def ensure_cont_ws(self):
        if self.cont_ws is None:
            self.cont_ws = open_pulse_ws()
            logger.info("[%s] Continuous PulseSTT connected",
                        self.session_id)

    def close_cont_ws(self):
        if self.cont_ws is None:
            return
        try:
            self.cont_ws.close()
        except Exception:
            pass
        self.cont_ws = None
        logger.info("[%s] Continuous PulseSTT closed", self.session_id)

    def save_background(self, text):
        if not text:
            return
        pub(
            self.ws,
            channel='dbs6',
            content='saveConvoRound',
            uuid=self.uuid,
            conversation=self.conversation,
            session_id=self.session_id,
            turn_id=str(uuid.uuid4()),
            messages=[{
                'role': 'observer',
                'content': text,
                'kind': 'background',
            }],
        )
        logger.info("[%s] Saved background speech", self.session_id)

    def queue_active_packet(self, ctx, text):
        packet = None
        if text:
            packet = {
                'channel': 'sup-in',
                'role': 'user',
                'content': text,
                'uuid': ctx['uuid'],
                'session_id': ctx['session_id'],
                'conversation': ctx['conversation'],
                'turn_id': ctx['turn_id'],
                'generate_audio': True,
                'stream': False,
                'sequence_no': ctx['sequence_no'],
                'started_at': ctx['started_at'],
                'ended_at': time.time(),
            }
        self.pending_packets[ctx['sequence_no']] = packet
        while self.next_seq in self.pending_packets:
            ready = self.pending_packets.pop(self.next_seq)
            self.next_seq += 1
            if not ready:
                continue
            logger.info("[%s] Publishing active turn seq=%s",
                        self.session_id, ready['sequence_no'])
            pub(self.ws, **ready)

    def emit_user_turn(self, text):
        text = (text or '').strip()
        self.turn_seq += 1
        ctx = {
            'sequence_no': self.turn_seq,
            'turn_id': str(uuid.uuid4()),
            'uuid': self.uuid,
            'session_id': self.session_id,
            'conversation': self.conversation,
            'started_at': time.time(),
        }
        self.queue_active_packet(ctx, text)

    def spawn_active_turn(self):
        if self.active_q is not None:
            logger.warning("[%s] Active turn already capturing",
                           self.session_id)
            return
        self.turn_seq += 1
        q = gevent.queue.Queue()
        ctx = {
            'sequence_no': self.turn_seq,
            'turn_id': str(uuid.uuid4()),
            'uuid': self.uuid,
            'session_id': self.session_id,
            'conversation': self.conversation,
            'started_at': time.time(),
        }
        upstream = open_pulse_ws()
        self.active_q = q
        gevent.spawn(self.run_active_turn, q, upstream, ctx)
        logger.info("[%s] Active turn started seq=%s",
                    self.session_id, ctx['sequence_no'])

    def stop_active_turn(self, item):
        if self.active_q is None:
            logger.warning("[%s] Stop without active turn", self.session_id)
            return
        q = self.active_q
        self.active_q = None
        q.put(item)

    def abort_active_turn(self):
        if self.active_q is None:
            return
        q = self.active_q
        self.active_q = None
        q.put({'type': 'voice_recog_control', 'event': 'abort'})

    def run_active_turn(self, q, upstream, ctx):
        finals = []
        latest_transcript = ''
        done = gevent.event.Event()
        emitted = False

        def finish_turn(text=None, reason='complete'):
            nonlocal emitted
            if emitted:
                return
            emitted = True
            text = (text or '').strip()
            if text:
                logger.info("[%s] Active turn emitting seq=%s reason=%s",
                            self.session_id, ctx['sequence_no'], reason)
            else:
                logger.info("[%s] Active turn completing empty seq=%s reason=%s",
                            self.session_id, ctx['sequence_no'], reason)
            self.queue_active_packet(ctx, text)

        def reader():
            nonlocal latest_transcript
            while True:
                try:
                    raw = upstream.recv()
                except Exception as exc:
                    logger.warning("[%s] Active reader failed seq=%s: %s",
                                   self.session_id, ctx['sequence_no'], exc)
                    done.set()
                    return

                if raw is None or isinstance(raw, (bytes, bytearray)):
                    continue

                text = raw.strip()
                if not text:
                    continue

                try:
                    payload = json.loads(text)
                except json.JSONDecodeError:
                    logger.info("[%s] Active payload text seq=%s: %s",
                                self.session_id, ctx['sequence_no'], text[:120])
                    continue

                logger.error("RAW TTS: %r", payload)

                transcript = (payload.get('transcript') or '').strip()
                if transcript:
                    latest_transcript = transcript
                    if payload.get('is_final'):
                        finals.append(transcript)
                    # Send current best text as prefill for all transcripts
                    if payload.get('is_final'):
                        full_text = ' '.join(finals).strip()
                    else:
                        full_text = transcript
                    logger.info("[%s] Prefill seq=%s: %s",
                                self.session_id, ctx['sequence_no'], full_text[:120])
                    pub(self.ws,
                        channel='llm6-in',
                        role='user',
                        content=full_text,
                        uuid=ctx['uuid'],
                        session_id=ctx['session_id'],
                        conversation=ctx['conversation'],
                        turn_id=ctx['turn_id'],
                        prefill=True,
                        stream=False,
                        sequence_no=ctx['sequence_no'],
                        respond_to='llm6-prefill',
                        max_tokens=1)
                    if payload.get('is_final'):
                        logger.info("[%s] Active final seq=%s: %s",
                                    self.session_id, ctx['sequence_no'], transcript[:120])
                    else:
                        logger.info("[%s] Active partial seq=%s: %s",
                                    self.session_id, ctx['sequence_no'], transcript[:120])
                else:
                    logger.info("[%s] Active payload seq=%s: %s",
                                self.session_id, ctx['sequence_no'], str(payload)[:120])

                if payload.get('is_last'):
                    done.set()
                    return

        reader_g = gevent.spawn(reader)
        try:
            while True:
                item = q.get()
                if isinstance(item, dict):
                    event = item.get('event')
                    if event == 'stop':
                        try:
                            upstream.send(json.dumps({"type": "close_stream"}))
                            logger.info("[%s] Active close_stream seq=%s",
                                        self.session_id, ctx['sequence_no'])
                        except Exception as exc:
                            logger.warning("[%s] Active close_stream failed seq=%s: %s",
                                           self.session_id, ctx['sequence_no'], exc)
                            done.set()
                        break
                    if event == 'abort':
                        logger.info("[%s] Active abort seq=%s",
                                    self.session_id, ctx['sequence_no'])
                        finish_turn(reason='abort')
                        return
                    continue

                if not has_energy(item):
                    continue

                try:
                    upstream.send(item, opcode=ABNF.OPCODE_BINARY)
                except Exception as exc:
                    logger.warning("[%s] Active send failed seq=%s: %s",
                                   self.session_id, ctx['sequence_no'], exc)
                    done.set()
                    break

            if not done.wait(timeout=ACTIVE_FINALIZE_TIMEOUT_SECS):
                logger.warning(
                    "[%s] Active finalize timed out seq=%s after %ss",
                    self.session_id,
                    ctx['sequence_no'],
                    ACTIVE_FINALIZE_TIMEOUT_SECS,
                )
            text = ' '.join(finals).strip() or latest_transcript.strip()
            finish_reason = 'final' if finals else 'latest-transcript'
            finish_turn(text, reason=finish_reason)
        finally:
            finish_turn(reason='cleanup')
            reader_g.kill()
            try:
                upstream.close()
            except Exception:
                pass
            logger.info("[%s] Active turn finished seq=%s",
                        self.session_id, ctx['sequence_no'])

    def run_idle_reader(self):
        while not self.closed:
            if self.idle_ws is None:
                gevent.sleep(0.1)
                continue
            try:
                raw = self.idle_ws.recv()
            except Exception as exc:
                logger.warning("[%s] Idle reader failed: %s",
                               self.session_id, exc)
                self.close_idle_ws()
                gevent.sleep(0.1)
                continue

            if raw is None or isinstance(raw, (bytes, bytearray)):
                continue

            text = raw.strip()
            if not text:
                continue

            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                logger.info("[%s] Idle payload text: %s",
                            self.session_id, text[:120])
                continue

            transcript = (payload.get('transcript') or '').strip()
            if transcript and payload.get('is_final'):
                logger.info("[%s] Idle final: %s",
                            self.session_id, transcript[:120])
                self.save_background(transcript)
            elif transcript:
                logger.info("[%s] Idle partial: %s",
                            self.session_id, transcript[:120])
            else:
                logger.info("[%s] Idle payload: %s",
                            self.session_id, str(payload)[:120])

    def run_idle_writer(self):
        while not self.closed:
            try:
                item = self.idle_q.get(timeout=1)
            except gevent.queue.Empty:
                continue

            if isinstance(item, dict):
                continue
            if self.convo_mode == 'sleep' or not has_energy(item):
                continue

            try:
                self.ensure_idle_ws()
                self.idle_ws.send(item, opcode=ABNF.OPCODE_BINARY)
            except Exception as exc:
                logger.warning("[%s] Idle writer failed: %s",
                               self.session_id, exc)
                self.close_idle_ws()

    def schedule_cont_flush(self):
        if self.cont_flush is not None:
            self.cont_flush.kill()
        self.cont_flush = gevent.spawn_later(CONTINUOUS_DELAY_MS / 1000.0, self.flush_continuous)

    def flush_continuous(self):
        self.cont_flush = None
        if not self.cont_buffer:
            return
        text = ' '.join(self.cont_buffer).strip()
        self.cont_buffer = []
        if text:
            logger.info("[%s] Continuous utterance: %s", self.session_id, text[:120])
            self.emit_user_turn(text)

    def clear_continuous(self):
        if self.cont_flush is not None:
            self.cont_flush.kill()
            self.cont_flush = None
        self.cont_buffer = []

    def run_cont_reader(self):
        while not self.closed:
            if self.cont_ws is None:
                gevent.sleep(0.1)
                continue
            try:
                raw = self.cont_ws.recv()
            except Exception as exc:
                logger.warning("[%s] Continuous reader failed: %s", self.session_id, exc)
                self.close_cont_ws()
                gevent.sleep(0.1)
                continue

            if raw is None or isinstance(raw, (bytes, bytearray)):
                continue

            text = raw.strip()
            if not text:
                continue

            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                logger.info("[%s] Continuous payload text: %s",
                            self.session_id, text[:120])
                continue

            transcript = (payload.get('transcript') or '').strip()
            if transcript and payload.get('is_final'):
                logger.info("[%s] Continuous final: %s",
                            self.session_id, transcript[:120])
                self.cont_buffer.append(transcript)
                self.schedule_cont_flush()
            elif transcript:
                logger.info("[%s] Continuous partial: %s",
                            self.session_id, transcript[:120])
            else:
                logger.info("[%s] Continuous payload: %s",
                            self.session_id, str(payload)[:120])

    def run_cont_writer(self):
        while not self.closed:
            try:
                item = self.cont_q.get(timeout=1)
            except gevent.queue.Empty:
                continue

            if isinstance(item, dict):
                event = item.get('event')
                if event == 'flush':
                    self.flush_continuous()
                elif event == 'clear':
                    self.clear_continuous()
                continue
            if self.convo_mode != 'continuous' or not has_energy(item):
                continue
            if self.cont_flush is not None:
                self.cont_flush.kill()
                self.cont_flush = None

            try:
                self.ensure_cont_ws()
                self.cont_ws.send(item, opcode=ABNF.OPCODE_BINARY)
            except Exception as exc:
                logger.warning("[%s] Continuous writer failed: %s",
                               self.session_id, exc)
                self.close_cont_ws()

    def put(self, item):
        self.set_meta(item if isinstance(item, dict) else {})

        if isinstance(item, dict) and item.get('type') == 'voice_recog_control':
            event = item.get('event')
            if event == 'set_convo_mode':
                mode = item.get('mode')
                if mode in {'sleep', 'idle', 'active', 'continuous'}:
                    if self.convo_mode == 'active' and mode != 'active':
                        self.abort_active_turn()
                    if self.convo_mode == 'continuous' and mode != 'continuous':
                        self.cont_q.put({'event': 'flush'})
                    self.convo_mode = mode
                    if mode == 'sleep':
                        self.close_idle_ws()
                        self.close_cont_ws()
                        self.clear_continuous()
                    logger.info("[%s] convo_mode set to %s",
                                self.session_id, mode)
                else:
                    logger.warning("[%s] Invalid convo_mode: %s",
                                   self.session_id, mode)
                return

            if event == 'start' and self.convo_mode == 'active':
                self.spawn_active_turn()
                return

            if event == 'stop' and self.convo_mode == 'active':
                self.stop_active_turn(item)
                return

        if isinstance(item, (bytes, bytearray)):
            if self.convo_mode == 'active':
                if self.active_q is not None:
                    self.active_q.put(item)
                return
            if self.convo_mode == 'idle':
                self.idle_q.put(item)
                return
            if self.convo_mode == 'continuous':
                self.cont_q.put(item)

    def close(self):
        if self.closed:
            return
        self.closed = True
        self.abort_active_turn()
        self.close_idle_ws()
        self.close_cont_ws()
        self.clear_continuous()
        self.idle_reader.kill()
        self.idle_writer.kill()
        self.cont_reader.kill()
        self.cont_writer.kill()
        logger.info("[%s] Voice session closed", self.session_id)


def main():
    ws = ws_connect(IN_CHANNEL + ',' + PREFILL_CHANNEL)
    sessions = {}

    logger.info("Listening on %s and forwarding to PulseSTT",
                IN_CHANNEL)

    def get_session(session_id):
        session = sessions.get(session_id)
        if session is None or session.closed:
            session = SessionStream(session_id, ws)
            sessions[session_id] = session
        return session

    try:
        recv(ws)
        while True:
            channel_frame = ws.recv()
            if not channel_frame:
                continue
            if not isinstance(channel_frame, str):
                logger.info("Ignoring unexpected channel frame: %s",
                            str(channel_frame)[:40])
                continue

            # Handle llm6-prefill channel (global, not session-scoped)
            if channel_frame == PREFILL_CHANNEL:
                is_binary, payload = recv_raw(ws)
                if not is_binary and isinstance(payload, dict):
                    logger.info("Prefill response: %s", payload)
                continue

            if '::' not in channel_frame:
                logger.info("Ignoring unexpected channel frame: %s",
                            str(channel_frame)[:40])
                continue

            _channel, session_id = channel_frame.split('::', 1)
            if not session_id:
                logger.info("Ignoring frame with empty session_id")
                continue

            is_binary, payload = recv_raw(ws)
            session = get_session(session_id)
            if not is_binary and isinstance(payload, dict):
                payload.setdefault('session_id', session_id)
            session.put(payload)
    finally:
        for session in list(sessions.values()):
            session.close()


if __name__ == '__main__':
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    main()
