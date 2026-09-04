#!/usr/bin/env python3
'''
Usage:
    save_template <system_prompt> [--name=<name>] [--slug=<slug>] [--title-template=<title>] [--model=<model>] [--meta=<json>] [--timeout=<sec>]
    save_template (-h | --help | -v | --version)

Options:
    -h, --help               Show this screen and exit.
    -v, --version            Show this screen and exit.
    --name=<name>            Human-friendly template name.
    --slug=<slug>            Machine-friendly template slug.
    --title-template=<title> Default conversation title for new convos.
    --model=<model>          Default model stored with the template.
    --meta=<json>            JSON object of extra template metadata.
    --timeout=<sec>          Seconds to wait for dbs6 response [default: 10].
'''
from gevent import monkey as _; _.patch_all()
import os, sys, json, time, uuid, websocket, docopt

WS_BASE = os.getenv('WS_BASE', 'ws://localhost:5002/ws')
INTERNAL_SECRET = os.getenv('INTERNAL_SECRET', 'dev-secret')
CHANNELS = ['dbs6-out']


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


def main():
    args = docopt.docopt(__doc__, version='1.0.0')
    turn_id = str(uuid.uuid4())
    timeout = float(args['--timeout'])
    meta = {}
    if args['--meta']:
        meta = json.loads(args['--meta'])
        if not isinstance(meta, dict):
            raise SystemExit('--meta must decode to a JSON object')

    ws = websocket.WebSocket()
    ws.settimeout(timeout)
    ws.connect(
        WS_BASE + '?c=' + '&c='.join(CHANNELS),
        header=[f'X-Internal-Secret: {INTERNAL_SECRET}'],
    )

    payload = dict(
        role='user',
        uuid='00000000-0000-0000-0000-000000000000',
        conversation=None,
        turn_id=turn_id,
        system_prompt=args['<system_prompt>'],
    )
    if args['--name']:
        payload['name'] = args['--name']
    if args['--slug']:
        payload['slug'] = args['--slug']
    if args['--title-template']:
        payload['title_template'] = args['--title-template']
    if args['--model']:
        payload['model'] = args['--model']
    if meta:
        payload['meta'] = meta

    pub(ws, 'dbs6-in', 'saveTemplate', **payload)

    deadline = time.time() + timeout
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
    main()
