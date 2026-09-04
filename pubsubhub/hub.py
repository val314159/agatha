#!/usr/bin/env python3
"""PubSubHub websocket pub/sub server.

Usage:
  pubsubhub [options]
  pubsubhub (-h | --help)
  pubsubhub --version

Options:
  -H --host=<host>              Host interface to bind. Falls back to
                                PUBSUBHUB_HOST, HOST, then 127.0.0.1.
  -p --port=<port>              TCP port to bind. Falls back to PUBSUBHUB_PORT,
                                PORT, then 5002.
  -r --root=<path>              Static asset root. Falls back to
                                PUBSUBHUB_ROOT, ROOT, ./public, then packaged
                                assets.
  --auth-plugin=<module>        Auth backend: memory, none, or a Python module
                                with validate_session/get_auth_status/logout/
                                login/register functions. Falls back to
                                PUBSUBHUB_AUTH_PLUGIN, AUTH_PLUGIN, then memory.
  --internal-secret=<secret>    Secret accepted in X-Internal-Secret. Falls
                                back to PUBSUBHUB_INTERNAL_SECRET,
                                INTERNAL_SECRET, then dev-secret.
  -v --verbose                  Enable debug logging. Can also be set with
                                PUBSUBHUB_VERBOSE or VERBOSE.

"""
from gevent import monkey as _;_.patch_all()
import importlib
import json
import orjson
import logging
import os
import secrets
import sys
from importlib import metadata
from pathlib import Path

import gevent
import gevent.queue
from bottle import Bottle, request, response, redirect, static_file
from docopt import docopt
from geventwebsocket import WebSocketServer
from pidwatcher import PidFileWatcher, write_pid_file, basename


logger = logging.getLogger(Path(__file__).resolve().parent.stem)


telemetry_log = open('./telemetry.log', 'a+')


def tprint(*a, **kw):
    #return print(*a, **kw, file=telemetry_log)
    return print(*a, **kw, file=telemetry_log, flush=True)


def first_env(*names):
    for name in names:
        value = os.getenv(name)
        if value not in (None, ''):
            return value
    return None


def env_flag(*names):
    value = first_env(*names)
    if value is None:
        return False
    return value.lower() not in ('0', 'false', 'no', 'off')


def option_value(args, option, *env_names, default=None):
    return args.get(option) or first_env(*env_names) or default


INTERNAL_SECRET = (
    first_env('PUBSUBHUB_INTERNAL_SECRET', 'INTERNAL_SECRET') or 'dev-secret'
)


try:
    __version__ = metadata.version('pubsubhub')
except metadata.PackageNotFoundError:
    __version__ = '1.1.0'


def default_public_root():
    candidates = [
        Path.cwd() / 'public',
        Path(__file__).resolve().parent / 'public',
        Path(sys.prefix) / 'pubsubhub' / 'public',
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return str(Path.cwd() / 'public')


class MemoryAuth:
    """Small in-process auth backend for local CLI use."""

    def __init__(self):
        self.users = {}
        self.sessions = {}

    def register(self, email, digest):
        print("MEMORY AUTH REGISTER")
        if not email or not digest:
            return {'status': 'error', 'error': 'email and digest are required'}
        if email in self.users:
            return {'status': 'error', 'error': 'user already exists'}
        user_id = secrets.token_hex(8)
        self.users[email] = {
            'email': email,
            'digest': digest,
            'user_id': user_id,
            'conversation_id': None,
        }
        return {'status': 'ok', 'user_id': user_id}

    def login(self, email, digest, device_id=None):
        print("MEMORY AUTH LOGIN")
        user = self.users.get(email)
        if not user or not secrets.compare_digest(user['digest'], digest or ''):
            return {'status': 'error', 'error': 'invalid email or password'}
        session_token = secrets.token_urlsafe(32)
        self.sessions[session_token] = {
            'email': email,
            'user_id': user['user_id'],
            'device_id': device_id,
            'conversation_id': user.get('conversation_id'),
        }
        return {
            'status': 'ok',
            'session_token': session_token,
            'user_id': user['user_id'],
        }

    def logout(self, session_token):
        print("MEMORY AUTH LOGOUT")
        self.sessions.pop(session_token, None)
        return {'status': 'ok'}

    def validate_session(self, session_token):
        print("MEMORY AUTH VALIDATE")
        session = self.sessions.get(session_token)
        return session['user_id'] if session else None

    def get_auth_status(self, session_token, device_id=None):
        print("MEMORY AUTH STATUS")
        session = self.sessions.get(session_token)
        if not session:
            return {'logged_in': False, 'device_id': device_id}
        return {
            'logged_in': True,
            'email': session.get('email'),
            'user_id': session.get('user_id'),
            'conversation_id': session.get('conversation_id'),
            'device_id': session.get('device_id') or device_id,
        }

    def get_or_create_last_conversation_locked(self, user_id):
        print("MEMORY AUTH GET OR CREATE")
        return None


class NoAuth:
    """Auth backend that treats every request as a development user."""

    user_id = 'anonymous'

    def register(self, email, digest):
        return {'status': 'ok', 'user_id': self.user_id}

    def login(self, email, digest, device_id=None):
        return {
            'status': 'ok',
            'session_token': 'anonymous',
            'user_id': self.user_id,
        }

    def logout(self, session_token):
        return {'status': 'ok'}

    def validate_session(self, session_token):
        return self.user_id

    def get_auth_status(self, session_token, device_id=None):
        return {
            'logged_in': True,
            'email': 'anonymous@localhost',
            'user_id': self.user_id,
            'conversation_id': None,
            'device_id': device_id,
        }

    def get_or_create_last_conversation_locked(self, user_id):
        return None


def load_auth_backend(spec):
    if spec in ('', None, 'memory'):
        return MemoryAuth()
    if spec in ('none', 'noauth', 'no-auth'):
        return NoAuth()
    return importlib.import_module(spec)


class PubSub(Bottle):

    Channel = dict()
    Sessions = dict()

    def __init__(self, auth=None, public_root=None, internal_secret=None):
        super().__init__()
        self.auth = auth or MemoryAuth()
        self.public_root = public_root or default_public_root()
        self.internal_secret = internal_secret or INTERNAL_SECRET
        self.Channel = {}
        self.Sessions = {}

    def configure(_, auth=None, public_root=None, internal_secret=None):
        if auth is not None:
            _.__dict__['auth'] = auth
        if public_root is not None:
            _.__dict__['public_root'] = public_root
        if internal_secret is not None:
            _.__dict__['internal_secret'] = internal_secret

    def subscribe(_, ws, channels):
        rec = (hex(id(ws)), ws)
        for name in channels:
            try:
                _.Channel[name].append(rec)
            except:
                _.Channel[name] = [rec]

    def unsubscribe(_, ws, channels):
        rec = (hex(id(ws)), ws)
        for name in channels:
            ch = _.Channel[name]
            ch.remove(rec)
            if not ch:
                del _.Channel[name]

    def pub_raw(_, ws, channel, raw, raw2=''):
        sraw = str(raw)[:256]
        sraw2 = str(raw2)[:256]
        #logger.info("PUB RAW channel=%s raw=%s raw2=%s", channel, sraw, sraw2)
        _.T.put((channel, raw, raw2))
        # this doesnt work: _.T.put((channel, raw, raw2))
        if channel.endswith('::'):
            short_channel = channel
            session_id = _.Sessions.get(ws)
            wire_channel = short_channel + session_id
        elif '::' in channel:
            short_channel, session_id = channel.split('::', 1)
            wire_channel = ''
        else:
            short_channel = channel
            session_id = None
            wire_channel = ''
            pass
        if channel[0] in '*+':
            wire_channel = channel
            pass
        for _wsid2, ws2 in _.Channel.get(short_channel,[]):
            if ws == ws2:
                logger.debug("Skipping raw publish back to sender")
                continue
            if  (  wire_channel or
                   not session_id or # No session filter, publish to all
                   _.Sessions.get(ws2) == session_id  ):
                if wire_channel:
                    ws2.send(wire_channel)
                    pass
                ws2.send(raw)
                if channel.startswith('*'):
                    ws2.send(raw2)
                    pass
                pass
            pass
        pass

    def add_session(_, ws, session_id):
        _.Sessions[ws] = session_id

    def del_session(_, ws):
        _.Sessions.pop(ws, None)

    def process(_, ws, uuid=None, session_id=None):
        channels = request.query.getall('c')
        try:
            _.subscribe(ws, channels)
            convo = request.app.auth.get_or_create_last_conversation_locked(uuid)
            ws.send(json.dumps({
                'method': 'initialize',
                'params': {
                    'uuid': uuid,
                    'conversation': convo.get('id'),
                    'channels': channels,
                    'session_id': session_id
                }
            }))
            state = 0
            logger.debug("Waiting for websocket messages")
            while msg:= ws.receive():
                logger.debug("Received message: %s", msg)
                if   state == 0  and  msg[0] in '[{':
                    channel = json.loads(msg).get('params',{})['channel']
                    _.Q.put((ws, channel, msg))
                elif state == 0:
                    channel = msg
                    if channel.startswith('*'):
                        state = 2
                    else:
                        state = 1
                elif state == 1:
                    _.Q.put((ws, channel, msg))
                    state = 0
                elif state == 2:
                    frame1 = msg
                    state = 3
                elif state == 3:
                    _.Q.put((ws, channel, frame1, msg))
                    state = 0
                else:
                    raise Exception('Bad state', state)
        finally:
            _.del_session(ws)
            _.unsubscribe(ws, channels)
            pass
        logger.info("Websocket disconnected")
        pass

    def drain(_):
        while 1:
            _.pub_raw(*_.Q.get())
            
    def tdrain(_):
        tprint(">> Telemetry started...")
        while 1:
            args = _.T.get()
            channel, raw, raw2 = args
            if type(raw) == bytearray:
                raw = repr(raw[:32])+'...'
            else:
                cooked = orjson.loads(raw)
                if cooked.get('method') == 'pub':
                    cooked = cooked.get('params')
                    pass  
                if cooked.get('role'):
                    if cooked.get('role') == 'assistant':
                        cooked['role'] = 'asst'
                        pass
                    if 'done' in cooked:
                        cooked['done'] = int(cooked['done'])
                    if 'round_done' in cooked:
                        cooked['round_done'] = int(cooked['round_done'])
                    if 'content' in cooked:
                        content = cooked.pop('content')
                        cooked['content'] = content
                        pass
                    if 'from_' in cooked:
                        from_ = cooked.pop('from_')
                        cooked['from_'] = from_
                        pass
                cooked.pop('session_id', '')
                cooked.pop('turn_id', '')
                cooked.pop('conversation', '')
                cooked.pop('channel', '')
                cooked.pop('uuid', '')
                raw = orjson.dumps(cooked).decode()
            if type(raw2) == bytearray:
                raw2 = repr(raw2[:32])+'...'
            tprint(f"{channel:<20.20}--{str(raw)}--{str(raw2)}")

    def run(_, host='127.0.0.1', port=5002):
        _.Q = gevent.queue.Queue()
        _.T = gevent.queue.Queue()
        logger.info("Serving static assets from %s", _.public_root)
        logger.info("Starting server with gevent on http://%s:%s!", host, port)
        svr = WebSocketServer((host, port), _, log=None)
        gevent.spawn(_.drain)
        gevent.spawn(_.tdrain)
        svr.start()
        logger.debug("Bound to %s %s!", svr.socket.getsockname()[:2])
        ready_path = write_pid_file('pubsub.ready')
        logger.info("Saved %s", ready_path)
        svr.serve_forever()
        return

    pass


def add_cors_headers(headers, origin=''):
    """Add CORS headers to the response"""
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Access-Control-Allow-Origin' ] = origin or '*'
    headers['Access-Control-Allow-Headers'] = \
        'Origin, Accept, Content-Type, X-Requested-With, X-CSRF-Token'
    headers['Access-Control-Allow-Credentials'] = 'true'
    return


def add_no_cache_headers(headers):
    """Prevent browsers and proxies from caching dynamic or mutable app responses."""
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    headers['Pragma'] = 'no-cache'
    headers['Expires'] = '0'
    return


app = PubSub()

@app.get('/ws')
@app.get('/ws/')
def _():
    ws = request.environ.get('wsgi.websocket')
    if not ws:
        logger.error("No websocket in request environment")
        raise Exception('No websocket')
    # Check for internal service bypass
    if request.headers.get('X-Internal-Secret') == request.app.internal_secret:
        # Internal service - use system user
        logger.info("Internal service websocket connected")
        return request.app.process(ws)
    if ( session_token := request.get_cookie('session') ) and \
       ( user_id := request.app.auth.validate_session(session_token) ):
        request.app.add_session(ws, session_token)
        return request.app.process(ws, uuid=user_id, session_id=session_token)
    # No valid session - close connection with policy violation + reason
    ws.close(code=1008, message='auth_failed')
    gevent.sleep(0.2)

@app.get('/auth/status')
def _():
    add_no_cache_headers(response.headers)
    session_token = request.get_cookie('session')
    device_id = request.get_cookie('device_id')
    return request.app.auth.get_auth_status(session_token, device_id)

@app.post('/auth/logout')
def _():
    add_no_cache_headers(response.headers)
    session_token = request.get_cookie('session')
    result = request.app.auth.logout(session_token)
    response.delete_cookie('session', path='/')
    return result

@app.post('/auth/login')
def _():
    add_no_cache_headers(response.headers)
    data = request.json or {}
    email = data.get('email')
    digest = data.get('digest')
    # Get or create device_id
    device_id = request.get_cookie('device_id')
    if not device_id:
        device_id = secrets.token_hex(16)
        response.set_cookie('device_id', device_id,
                            path='/', httponly=True, samesite='lax')
    result = request.app.auth.login(email, digest, device_id)
    if result.get('status') == 'ok' and 'session_token' in result:
        response.set_cookie('session', result['session_token'],
                            path='/', httponly=True, samesite='lax')
    return result

@app.post('/auth/register')
def _():
    add_no_cache_headers(response.headers)
    data = request.json or {}
    email = data.get('email')
    digest = data.get('digest')
    create_convo = not data.get('no_create_user', False)
    result = request.app.auth.register(email, digest)
    if result.get('status') == 'ok' and create_convo:
        request.app.auth.get_or_create_last_conversation_locked(result['user_id'])
    return result

@app.get('/auth/login.html')
def _():
    add_no_cache_headers(response.headers)
    return redirect('/login.html')

@app.get('/auth/register.html')
def _():
    add_no_cache_headers(response.headers)
    return redirect('/register.html')

@app.get('/auth/status.html')
def _():
    add_no_cache_headers(response.headers)
    return redirect('/status.html')

@app.get('/')
def _():
    add_no_cache_headers(response.headers)
    return redirect('/chat.html')

@app.get('<path:path>')
def serve_file(path):
    add_no_cache_headers(response.headers)
    root = request.app.public_root
    if path.endswith('/'):
        path += 'index.html'
    elif os.path.isdir(os.path.join(root, path)):
        return redirect(path + '/')
    return static_file(path, root=root)


def main(argv=None):
    args = docopt(__doc__, argv=argv, version=f'pubsubhub {__version__}')
    verbose = args['--verbose'] or env_flag('PUBSUBHUB_VERBOSE', 'VERBOSE')
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format='%(levelname)s:%(name)s:%(message)s',
    )

    host = option_value(
        args, '--host', 'PUBSUBHUB_HOST', 'HOST', default='127.0.0.1'
    )
    port_arg = option_value(
        args, '--port', 'PUBSUBHUB_PORT', 'PORT', default='5002'
    )
    root = option_value(args, '--root', 'PUBSUBHUB_ROOT', 'ROOT')
    print("ROOT", root)
    auth_plugin = option_value(
        args,
        '--auth-plugin',
        'PUBSUBHUB_AUTH_PLUGIN',
        'AUTH_PLUGIN',
        default='memory',
    )
    internal_secret = option_value(
        args,
        '--internal-secret',
        'PUBSUBHUB_INTERNAL_SECRET',
        'INTERNAL_SECRET',
        default='dev-secret',
    )

    try:
        port = int(port_arg)
    except ValueError as exc:
        raise SystemExit('--port must be an integer') from exc

    app.configure(
        auth=load_auth_backend(auth_plugin),
        public_root=str(Path(root or default_public_root()).expanduser()),
        internal_secret=internal_secret,
    )

    app.run(host=host, port=port)


if __name__ == '__main__':
    main()
