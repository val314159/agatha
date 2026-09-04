from gevent import monkey as _;_.patch_all()
from bottle import Bottle, request, response, redirect, static_file, app, run
import orjson
import json
import time
import os
import fcntl
import sys
import uuid
from pathlib import Path
from gevent.fileobject import FileObject
import gevent, gevent.queue as q, gevent.subprocess as subp
from websocket import WebSocket, ABNF
from geventwebsocket import WebSocketServer, WebSocketError
from geventwebsocket.websocket import (
    MSG_CLOSED, MSG_ALREADY_CLOSED, MSG_SOCKET_DEAD)
from pidwatcher import PidFileWatcher, write_pid_file, basename

# This makes stdin's FD non-blocking and replaces sys.stdin with
# a wrapper that is integrated into the event loop
#xstdin = FileObject(sys.stdin)

def recv(ws):
    raw = ws.recv()
    if not raw:
        raise EOFError
    return json.loads(raw)

def recv_raw(ws):
    raw = ws.recv()
    if type(raw) == bytes:
        #if isinstance(raw, (bytes, bytearray)):
        return True, raw
    else:
        return False, json.loads(raw)

def recv2(ws):
    raw = ws.recv()
    if not raw:
        raise EOFError
    return json.loads(raw), raw

def send(ws, msg):
    return ws.send( json.dumps(msg) )

def mesg(method, **params):
    return dict(method=method, params=params)

def pub_params(ws, params, **kw):
    return send(ws, mesg('pub', **dict(params, **kw)))

def pub(ws, channel=None, content='', **kw):
    return send(ws, mesg('pub',
                         channel = channel or kw['channel'],
                         content = content, **kw))

def pub_raw(ws, channel, content):
    ws.send(channel)
    if isinstance(content, (bytes, bytearray)):
        ws.send(content, ABNF.OPCODE_BINARY)
    else:
        ws.send(content, ABNF.OPCODE_TEXT)
        pass
    return

def call(ws, method, **params):
    return send(ws, mesg(method, **params))

AUDIO_CHUNK_SIZE = 2 * 1024

AUDIO_GENERATION_TIMEOUT = 10 # seconds for audio generation to start

AUDIO_DIR = os.path.realpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'audio'))
print("AUDIO_DIR", AUDIO_DIR)

VIDEO_DIR = os.path.realpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'uploads'))
print("VIDEO_DIR", VIDEO_DIR)

def xcreate_audio_directory():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    print("CREATE AUDIO DIR", AUDIO_DIR)
    return AUDIO_DIR

def xcreate_video_directory():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    print("CREATE VIDEO DIR", VIDEO_DIR)
    return VIDEO_DIR

def system(cmd):
    print("CMD", cmd)
    res = subp.run(cmd, shell=True, check=True)
    print("RES", res)
    return res


def add_cors_headers(headers, origin=''):
    """Add CORS headers to the response"""
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Access-Control-Allow-Origin' ] = origin or '*'
    headers['Access-Control-Allow-Headers'] = \
        'Origin, Accept, Content-Type, X-Requested-With, X-CSRF-Token'
    headers['Access-Control-Allow-Credentials'] = 'true'
    return


WS_URI = "ws://localhost:5002/ws"

INTERNAL_SECRET = os.getenv('INTERNAL_SECRET', 'dev-secret')


def ws_connect(channels='', ws=None):
    if not ws:
        ws = WebSocket()
        pass
    headers = {'X-Internal-Secret': INTERNAL_SECRET}
    url = WS_URI+'?c='+'&c='.join(channels.split(','))
    ws.connect(url, header=headers)
    return ws
