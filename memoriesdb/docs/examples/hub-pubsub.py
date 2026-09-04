import json
import os
import uuid

import websocket


WS_BASE = os.getenv("WS_BASE", "ws://localhost:5002/ws")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "dev-secret")
USER_ID = os.getenv("MEMORIESDB_USER_ID", "00000000-0000-0000-0000-000000000000")


def main():
    turn_id = str(uuid.uuid4())
    ws = websocket.WebSocket()
    ws.connect(
        f"{WS_BASE}?c=dbs6-out",
        header=[f"X-Internal-Secret: {INTERNAL_SECRET}"],
    )

    ws.send("dbs6-in")
    ws.send(json.dumps({
        "method": "pub",
        "params": {
            "channel": "dbs6-in",
            "content": "listConvos",
            "uuid": USER_ID,
            "turn_id": turn_id,
        },
    }))

    while True:
        msg = json.loads(ws.recv())
        params = msg.get("params", {})
        if msg.get("method") == "pub" and params.get("turn_id") == turn_id:
            print(json.dumps(msg, indent=2, sort_keys=True))
            return


if __name__ == "__main__":
    main()

