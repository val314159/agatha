#!/usr/bin/env python3
from aif.lib.wsutil import *
from aif.lib.logging_setup import setup_logger as _;_(__file__)
import logging
import uuid, gevent
from gevent.monkey import get_original

try:
    from prompt_toolkit import prompt
    from prompt_toolkit.patch_stdout import patch_stdout
except ImportError:
    prompt = None
    patch_stdout = None


OriginalThread = get_original('threading', 'Thread')
OriginalQueue = get_original('queue', 'Queue')
OriginalQueueEmpty = get_original('queue', 'Empty')

logger = logging.getLogger(__name__)
logger.setLevel(logging.ERROR)

def main():
    ch = os.getenv("CH", "llm6")
    ch_in = os.getenv("CH_IN", ch + "-in")
    ch_out = os.getenv("CH_OUT", ch + "-out")
    client_uuid = None
    conversation = None
    input_queue = OriginalQueue()

    ws = ws_connect(ch_out)

    init = ws.recv()
    logger.info("INIT0 %s", init)
    params = json.loads(init)['params']

    last_turn_id = None

    conversation = params.get("conversation")
    client_uuid = params.get("uuid")
    if not conversation or not client_uuid:
        raise RuntimeError("chat.py: initialize missing required conversation or uuid")

    def ws_once():
        nonlocal last_turn_id
        msg = recv(ws)

        logger.info(f"ws_once: {msg}")

        method = msg.get("method")
        params = msg.get("params", {})

        if method == "initialize":
            logger.info("INIT1 %s", params)
            raise Exception
            return params
        elif method == "pub":
            if params.get("channel") == ch_out:

                this_turn_id = params.get('turn_id')

                logger.info("turn_transition last_turn_id=%r this_turn_id=%r params=%r",
                            last_turn_id, this_turn_id, params)

                if last_turn_id != this_turn_id:
                    print("asst>", end=" ")
                    last_turn_id = this_turn_id

                if content := params.get('content'):
                    if params.get('role') == 'assistant':
                        print(content, end='', flush=True)

                if params.get('done'):
                    print("\nuser>", end=" ", flush=True)

            else:
                logger.info("PUB %s", params)
        else:
            logger.error("*" * 80)
            logger.error("ERROR, BAD PACKET %s", msg)
            logger.error("*" * 80)
        return None

    def ws_loop():
        try:
            while 1:
                ws_once()
                gevent.sleep(0)
        except Exception as e:
            logger.exception("ws_loop failed: %s", e)
            raise SystemExit(1)

    def input_loop():
        if prompt is None or patch_stdout is None:
            raise RuntimeError("chat.py requires prompt_toolkit for interactive input")
        with patch_stdout(raw=True):
            while True:
                try:
                    content = prompt("user> ")
                except KeyboardInterrupt:
                    continue
                except EOFError:
                    input_queue.put(None)
                    return
                input_queue.put(content + "\n")

    gevent.spawn(ws_loop)

    OriginalThread(target=input_loop, daemon=True).start()
    
    while True:
        try:
            content = input_queue.get_nowait()
        except OriginalQueueEmpty:
            gevent.sleep(0.05)
            continue
        
        if content is None:
            break

        print("C", repr(content))
        
        role = "user"
        turn_id = str(uuid.uuid4())
        if content.startswith("system: "):
            role = "system"
            content = content[len("system: ") :]
            pass
            
        pub(
            ws,
            ch_in,
            content,
            role=role,
            uuid=client_uuid,
            conversation=conversation,
            turn_id=turn_id,
        )
        pass
    logger.info("EOF")
    
    return
    

if __name__ == "__main__":
    main()
