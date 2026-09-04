#!/usr/bin/env python3
from aif.lib.wsutil import *


def main():
    CH = os.getenv('CH', 'llm')
    
    CH_IN  = os.getenv('CH_IN', CH+'-in')
    CH_OUT = os.getenv('CH_OUT',CH+'-out')

    CHANNELS = [CH_OUT]

    WS_BASE = f"ws://localhost:5002/ws"
    WS_ARGS = '?c='+'&c='.join(CHANNELS)

    WS_ARGS += '&tok=qwert'
    
    def readline():
        content = '\n'
        while content == '\n':
            print("user>", end=' ')
            content = stdin.readline()
            pass
        return content

    ws = WebSocket()
    ws.connect(WS_BASE + WS_ARGS)

    def ws_once():
        msg = recv(ws)
        method = msg.get('method')
        params = msg.get('params',{})
                
        if method=='initialize':
            print("INIT", params)
                    
        elif method=='pub':
            print("PUB", params)
                    
        else:
            print("*"*80)
            print("ERROR, BAD PACKET", msg)
            print("*"*80)
            pass
        pass
    
    def ws_loop():
        while 1:
            try:
                ws_once()
                time.sleep(0.2)
            except:
                print("SERVER EOF, EXIT OUT ALL THE WAY")
                raise sys.exit(2)
            pass
        pass
    
    gevent.spawn(ws_loop)

    while content := readline():

        role = 'user'

        if content.startswith('system: '):
            role = 'system'
            content = content[len('system: '):]
            pass
        
        pub(ws, CH_IN, content, role=role)
        pass
    
    return print("EOF")


if __name__=='__main__':
    main()
