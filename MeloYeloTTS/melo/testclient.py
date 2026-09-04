import json
import websocket  # from websocket-client

def main():
    ws = websocket.create_connection("ws://localhost:9009/websocket", timeout=5)
    ws.send("Hello from client!")
    print("Server replied:", ws.recv())
    ws.close()

def test_audio():
    ws = websocket.create_connection("ws://localhost:9009/audiows")
    #ws.ping()
    texts = ["Hi there, please speak this sentence.",
             "this sentence as well.",
             ]
    ws.send(texts.pop(0))
    done = False
    while True:
        try:
            msg = ws.recv()
            print(type(msg)) 

            if not msg:
                print("Closing!")
                ws.close()
                break

            if msg == 'EOF':
                
                if done:
                    print("Closing!")
                    ws.close()
                    break

                ws.send(texts.pop(0))
                #done = True

            elif type(msg)==str:
                print("STR:", msg)

            elif type(msg)==bytes:
                print("BIN:", len(msg), msg[:25])

            
        except websocket.WebSocketConnectionClosedException:
            print("Closed!")
            break
        
        except IndexError:
            print("Closing!")
            ws.close()
            break
        
        pass
    
    print("Chunk:", repr(msg[:60]), "…")
    ws.close()

if __name__ == "__main__":
    main()
    test_audio()
    
