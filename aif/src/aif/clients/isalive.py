#!/usr/bin/env python3
"""
Pubsub health check.

Uses two websocket connections because the hub does not reflect publishes
back to the sending socket.
"""

import time
import gevent
import uuid
import logging

from aif.lib.wsutil import *
from aif.lib.logging_setup import setup_logger as _;_(__file__, level=logging.INFO)
logger = logging.getLogger(__name__)

CHANNEL = 'health-echo'
PING_INTERVAL = 5  # seconds
TIMEOUT = 0.5  # seconds
MAX_TIMEOUTS = 4


def expect_initialize(ws, name):
    msg = recv(ws)
    if msg.get('method') != 'initialize':
        raise RuntimeError(f"{name}: expected initialize, got {msg!r}")
    logger.info(f"{name}: initialized")


def main():
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    logger.info("Pubsub Health Check - isalive.py")
    logger.info(f"Publishing on {CHANNEL}, listening on {CHANNEL}")
    ws_send = ws_connect()
    ws_recv = ws_connect(CHANNEL)
    expect_initialize(ws_send, 'send socket')
    expect_initialize(ws_recv, 'recv socket')
    consecutive_timeouts = 0
    while True:
        ping_id = str(uuid.uuid4())
        sent_at = time.time()
        try:
            pub(
                ws_send,
                channel=CHANNEL,
                content='ping',
                ping_id=ping_id,
                timestamp=sent_at,
            )
            logger.debug(f"[{sent_at:.2f}] Sent ping {ping_id}")
        except gevent.Timeout:
            consecutive_timeouts += 1
            logger.warning(f"[{time.time():.2f}] TIMEOUT {consecutive_timeouts}/{MAX_TIMEOUTS} waiting for ping {ping_id}")
            if consecutive_timeouts >= MAX_TIMEOUTS:
                raise SystemExit(1)
        except Exception as exc:
            logger.error(f"[{time.time():.2f}] Ping failed: {exc}")
            time.sleep(1)
            continue
        try:
            while True:
                msg = gevent.with_timeout(TIMEOUT, recv, ws_recv)
                if msg.get('method') != 'pub':
                    continue
                params = msg.get('params', {})
                if params.get('channel') != CHANNEL:
                    continue
                if params.get('ping_id') != ping_id:
                    continue
                received_at = time.time()
                latency_ms = (received_at - sent_at) * 1000.0
                consecutive_timeouts = 0
                logger.info(f"[{received_at:.2f}] Received ping {ping_id} in {latency_ms:.1f}ms")
                break
        except gevent.Timeout:
            consecutive_timeouts += 1
            logger.warning(f"[{time.time():.2f}] TIMEOUT {consecutive_timeouts}/{MAX_TIMEOUTS} waiting for ping {ping_id}")
            if consecutive_timeouts >= MAX_TIMEOUTS:
                raise SystemExit(1)
            continue
        except Exception as exc:
            logger.error(f"[{time.time():.2f}] Error: {exc}")
            time.sleep(1)
            continue
        gevent.sleep(PING_INTERVAL)


if __name__ == '__main__':
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    main()
