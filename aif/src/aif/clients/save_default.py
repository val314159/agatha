#!/usr/bin/env python3
#from gevent import monkey as _; _.patch_all()
import json
import os
import sys
import time
import uuid
import websocket
from pidwatcher import PidFileWatcher, write_pid_file, basename

WS_BASE = os.getenv('WS_BASE', 'ws://localhost:5002/ws')
INTERNAL_SECRET = os.getenv('INTERNAL_SECRET', 'dev-secret')
CHANNELS = ['dbs6-out']
PROMPT_PATH = os.getenv('PROMPT_PATH', os.path.join('prompts', 'agatha.1.0.txt'))
TIMEOUT = float(os.getenv('TIMEOUT', '10'))

MODEL = os.getenv('MODEL', 'test')

def recv(ws):
    raw = ws.recv()
    if not raw:
        raise EOFError
    return json.loads(raw)


def send(ws, msg):
    return ws.send(json.dumps(msg))


def mesg(method, **params):
    return dict(method=method, params=params)


def pub(ws, channel, content='', **kw):
    ws.send(channel)
    return send(ws, mesg('pub', channel=channel, content=content, **kw))


def load_prompt():
    with open(PROMPT_PATH, 'r', encoding='utf-8') as fh:
        return ''.join(
            line for line in fh.readlines()
            if not line.lstrip().startswith('#')
        ).strip()


def main():
    turn_id = str(uuid.uuid4())
    prompt = load_prompt()
    if not prompt:
        raise SystemExit(f'Prompt file is empty: {PROMPT_PATH}')

    ws = websocket.WebSocket()
    ws.settimeout(TIMEOUT)
    ws.connect(
        WS_BASE + '?c=' + '&c='.join(CHANNELS),
        header=[f'X-Internal-Secret: {INTERNAL_SECRET}'],
    )

    payload = dict(
        role='user',
        uuid='00000000-0000-0000-0000-000000000000',
        conversation=None,
        turn_id=turn_id,
        system_prompt=prompt,
        name='Default',
        slug='default',
        title_template='Agatha',
        model=MODEL,
    )

    pub(ws, 'dbs6-in', 'saveTemplate', **payload)

    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        msg = recv(ws)
        method = msg.get('method')
        params = msg.get('params', {})
        if method == 'initialize':
            continue
        if method != 'pub':
            continue
        if params.get('content') != 'saveTemplate':
            continue
        if params.get('turn_id') != turn_id:
            continue
        if params.get('error'):
            print(params['error'], file=sys.stderr)
            raise SystemExit(1)
        results = params.get('results') or []
        if not results:
            print('saveTemplate returned no results', file=sys.stderr)
            raise SystemExit(1)
        print(json.dumps(results[0], indent=2, sort_keys=True))
        return

    raise SystemExit('Timed out waiting for saveTemplate response')


if __name__ == '__main__':
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    main()
