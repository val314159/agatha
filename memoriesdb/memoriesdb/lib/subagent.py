import os, json, websocket, logging

WS_BASE = "ws://localhost:5002/ws"
NAME = os.environ['NAME']
IN_CHANNEL  = NAME+'-in'
OUT_CHANNEL = NAME+'-out'
INTERNAL_SECRET = os.getenv('INTERNAL_SECRET', 'dev-secret')
logger = logging.getLogger(__name__)

class SubAgentBase:

    def connect_ws(_):
        '''this way an error doesn't leave garbage in _.ws'''
        ws = websocket.WebSocket()
        headers = {'X-Internal-Secret': INTERNAL_SECRET}
        ws.connect(f'{WS_BASE}?c={IN_CHANNEL}', header=headers)
        _._ws = ws
        pass

    def ws(_):
        return _._ws

    def initialize(_, params):
        pass
    
    def  pub(_, params):
        return _._pub(**params)

    def _pub(_, **kw):
        raise Exception('NYI')

    def publish(_, channel, msg):
        _.ws().send(channel)
        _.ws().send(json.dumps({
            'method': 'pub',
            'params': dict(channel=channel, **msg),
        }))

    def main(_):
        _.connect_ws()
        while 1:
            logger.debug("Waiting on socket")
            raw = _.ws().recv()
            if not raw:
                raise EOFError
            msg = json.loads(raw)
            logger.debug("Got message %r", msg)
            method = msg.get('method')
            params = msg.get('params',{})
            if method=='initialize':  
                logger.info("Initialized subagent params=%r", params)
                _.initialize(params)
            elif method=='pub':
                try:
                    _.pub(params)
                except Exception:
                    logger.exception("Subagent pub failed params=%r", params)
                    return
            else:
                logger.error("Bad packet %r", msg)
                pass
            pass
        logger.info("Subagent socket EOF")
        return

    pass
