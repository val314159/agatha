#!/usr/bin/env python3
from gevent import monkey as _;_.patch_all()
import os, sys, json, secrets, gevent, gevent.queue
import logging
from memoriesdb.lib.logging_setup import setup_logger as _;_(__file__, level=logging.ERROR)
from gevent.fileobject import FileObject
from bottle import Bottle, request, response, redirect, static_file, app
from geventwebsocket import WebSocketServer
from geventwebsocket.websocket import (
    MSG_CLOSED, MSG_ALREADY_CLOSED, MSG_SOCKET_DEAD)
import psycopg
from memoriesdb.lib.db import get_last_conversation, get_or_create_last_conversation_locked
from memoriesdb.lib.auth import validate_session, get_auth_status, logout, login, register
from memoriesdb.lib.config import DSN, DSN2

logger = logging.getLogger(__name__)

INTERNAL_SECRET = os.getenv('INTERNAL_SECRET', 'dev-secret')

def check_db_startup():
    """Quick DB connectivity check at startup."""
    dsns = [DSN, DSN2]
    last_err = None
    for idx, dsn in enumerate(dsns, start=1):
        try:
            with psycopg.connect(dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT current_database(), inet_server_addr(), inet_server_port()")
                    db_name, db_addr, db_port = cur.fetchone()
            logger.info("DB startup check OK via DSN%s: db=%s host=%s port=%s", idx, db_name, db_addr, db_port)
            return True
        except Exception as exc:
            last_err = exc
            logger.warning("DB startup check failed via DSN%s: %s", idx, exc)
    msg = (
        "Database startup check failed for all DSNs. "
        "If running manually, try: uv run --env-file=.env memoriesdb/services/hub.py"
    )
    raise RuntimeError(msg) from last_err

def get_conversation_id(uuid):
    if not uuid:
        logger.info("Internal service connected without user context")
        return None
    # Get last conversation for this user
    if row := get_last_conversation(uuid):
        logger.debug("Last conversation lookup returned %r", row)
        conversation_id = str(row['id'])
        logger.info("Using conversation_id=%s", conversation_id)
        return conversation_id
    # New user with no conversations - let frontend create new convo
    logger.info("No conversation found for uuid=%s", uuid)
    return None

# This makes stdin's FD non-blocking and replaces sys.stdin with
# a wrapper that is integrated into the event loop
try:
    stdin = FileObject(sys.stdin)
except Exception:
    # If stdin can't be wrapped (e.g., pytest), use original
    stdin = sys.stdin

class Application(Bottle):

    Channel = dict()
    Sessions = dict()

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

    def drain(_):
        while (ws, channel, raw := _.Q.get()):

            logger.info("PUB RAW channel=%s raw=%s", channel, raw)

            if channel.endswith('::'):
                session_id = _.Sessions.get(ws)
                if not session_id:
                    logger.error("Missing session for channel expansion: %s", channel)
                    return None
                wire_channel = channel + session_id
            elif '::' not in channel:
                channel, session_id = channel.split('::')
                wire_channel = ''
            else:
                session_id = None
                wire_channel = ''

            for _wsid2, ws2 in _.Channel.get(channel, []):
                if ws == ws2:
                    logger.debug("Skipping raw publish back to sender")
                elif wire_channel:
                    ws2.send(wire_channel)
                    ws2.send(raw)
                elif not session_id:
                    ws2.send(raw)
                elif _.Sessions.get(ws2) == session_id:
                    ws2.send(raw)

    def add_session(_, ws, session_id):
        _.Sessions[ws] = session_id

    def remove_session(_, ws):
        _.Sessions.pop(ws, None)

    def process(_, ws, channels, params):
        try:
            _.subscribe(ws, channels)
            ws.send(json.dumps(dict(
                method='initialize',
                params=params
            )))
            logger.debug("Starting to read websocket messages")
            state = 0
            while msg:= ws.receive():
                if   state == 0:
                    if msg[0] in '[{':
                        channel = json.loads(msg).get('params',{})['channel']
                        _.Q.put((ws, channel, msg))
                    else:
                        channel = msg
                        state = 1
                elif state == 1:
                    _.Q.put((ws, channel, msg))
                    state = 0
                else:
                    raise Exception('Bad state', state)
        finally:
            _.remove_session(ws)
            _.unsubscribe(ws, channels)
            pass
        logger.info("Websocket disconnected")
        pass

    def run(_, host='', port=5002):
        _.Q = gevent.queue.Queue()        
        svr = WebSocketServer((host, port), _, log=None)
        logger.info("Starting server with gevent on http://%s:%s!", host, port)
        gevent.spawn(_.drain)
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

app = app.push(Application())

@app.get('/ws')
@app.get('/ws/')
def _():
    ws = request.environ.get('wsgi.websocket')
    if not ws:
        logger.error("No websocket in request environment")
        raise Exception('No websocket')    
    # Check for internal service bypass
    if request.headers.get('X-Internal-Secret') == INTERNAL_SECRET:
        # Internal service - use system user
        logger.info("Internal service websocket connected")
        session_id = None
        uuid = '00000000-0000-0000-0000-000000000000'
    else:
        session_id = request.get_cookie('session')
        uuid = validate_session(session_id)
        pass
    if uuid:
        channels = request.query.getall('c')
        request.app.add_session(session_id)
        conversation_id = get_conversation_id(uuid)
        params = dict(uuid=uuid,
                      conversation=conversation_id,
                      channels=channels, 
                      session_id=session_id)
        return request.app.process(ws, channels, params)
    # No valid session - close connection with policy violation + reason
    ws.close(code=1008, message='auth_failed')
    gevent.sleep(0.2)
    return

@app.get('/auth/status')
def _():
    add_no_cache_headers(response.headers)
    session_token = request.get_cookie('session')
    device_id = request.get_cookie('device_id')
    return get_auth_status(session_token, device_id)

@app.post('/auth/logout')
def _():
    add_no_cache_headers(response.headers)
    session_token = request.get_cookie('session')
    result = logout(session_token)
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
        response.set_cookie('device_id', device_id, path='/', httponly=True, samesite='lax')
    result = login(email, digest, device_id)
    if result.get('status') == 'ok' and 'session_token' in result:
        response.set_cookie('session', result['session_token'], path='/', httponly=True, samesite='lax')
    return result

@app.post('/auth/register')
def _():
    add_no_cache_headers(response.headers)
    data = request.json or {}
    email = data.get('email')
    digest = data.get('digest')
    create_convo = data.get('create_convo')
    if create_convo is None:
        create_convo = not data.get('no_create_user', False)
    result = register(email, digest)
    if result.get('status') == 'ok' and create_convo:
        get_or_create_last_conversation_locked(result['user_id'])
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
def serve_file(path, root=os.getenv('ROOT','./public/')):
    add_no_cache_headers(response.headers)
    if path.endswith('/'):
        path += 'index.html'
    elif os.path.isdir(os.path.join(root, path)):
        return redirect(path + '/')
    return static_file(path, root=root)

if __name__ == '__main__':
    check_db_startup()
    app.run()