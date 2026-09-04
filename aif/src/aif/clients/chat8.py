#!/usr/bin/env python3
from aif.lib.wsutil import *
from aif.lib.logging_setup import setup_logger as _;_(__file__)
import logging
from pathlib import Path
import uuid, gevent

from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from prompt_toolkit.patch_stdout import patch_stdout


logger = logging.getLogger(__name__)

HISTORY_PATH = Path(os.getenv("CHAT8_HISTORY", "~/.aif/chat8_history")).expanduser()
HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
session = PromptSession(history=FileHistory(str(HISTORY_PATH)))


def main():
    ch = os.getenv("CH", "llm6")
    ch_in = os.getenv("CH_IN", ch + "-in")
    ch_out = os.getenv("CH_OUT", ch + "-out")
    client_uuid = None
    conversation = None

    ws = ws_connect(ch_out)

    init = ws.recv()
    print(init)
    params = json.loads(init)["params"]

    last_turn_id = None

    conversation = params.get("conversation")
    client_uuid = params.get("uuid")
    if not conversation or not client_uuid:
        raise RuntimeError("chat8.py: initialize missing required conversation or uuid")

    def emit(*args, **kwargs):
        # Keep prompt_toolkit's rendered prompt from fighting streamed stdout.
        with patch_stdout(raw=True):
            print(*args, **kwargs)

    def ws_once():
        nonlocal last_turn_id
        msg = recv(ws)

        logger.info("ws_once: %s", msg)

        method = msg.get("method")
        params = msg.get("params", {})

        this_turn_id = params.get("turn_id")

        logger.info(
            "turn_transition last_turn_id=%r this_turn_id=%r params=%r",
            last_turn_id,
            this_turn_id,
            params,
        )

        if method != "pub":
            logger.error("*" * 80)
            logger.error("ERROR, BAD PACKET %s", msg)
            logger.error("*" * 80)
            return

        if params.get("channel") == ch_out:
            if last_turn_id != this_turn_id:
                emit("asst>", end=" ")
                last_turn_id = this_turn_id

            if content := params.get("content"):
                if params.get("role") == "assistant":
                    emit(content, end="", flush=True)

            if params.get("done"):
                emit(flush=True)
                return

        else:
            logger.info("PUB %s", params)

        return None

    def ws_loop():
        try:
            while 1:
                ws_once()
                gevent.sleep(0)
        except Exception as e:
            logger.exception("ws_loop failed: %s", e)
            raise SystemExit(1)

    gevent.spawn(ws_loop)

    while True:
        with patch_stdout(raw=True):
            content = session.prompt("user> ")
            if not content:
                continue

        role = "user"
        turn_id = str(uuid.uuid4())
        if content.startswith("system: "):
            role = "system"
            content = content[len("system: ") :]

        pub(
            ws,
            ch_in,
            content,
            role=role,
            uuid=client_uuid,
            conversation=conversation,
            turn_id=turn_id,
            stream=True,
        )


if __name__ == "__main__":
    main()
