#!/usr/bin/env python3
'''
'''

from aif.lib.wsutil import *
import json

OUT_CHANNELS = 'sup-out,aud-out-bin,aud-out-ctl'

if __name__=='__main__':
  print("I SPY WITH MY LITTLE EYE")
  ws = ws_connect(OUT_CHANNELS)
  print("WS", ws)
  while 1:
    print("...waiting...")
    x = ws.recv()
    print("GOT", x)
    
