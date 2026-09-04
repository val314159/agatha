#!/usr/bin/python3
import geventwebsocket as gws
from bottle import request, abort, default_app, static_file
import re, sys, json, time, io, numpy as np, soundfile as sf
from melo.api import TTS

language = 'EN'
speaker = 'EN-AU'
#device = 'cpu'
device = 'auto'
tts = TTS(language='EN', device=device)
speaker_id = tts.hps.data.spk2id[speaker]
sr = tts.hps.data.sampling_rate
app = default_app()

def sound_file(output):
    return sf.SoundFile(output, "w",
                        samplerate=sr, channels=1,
                        format="WAV", subtype="PCM_16")

@app.route('/websocket')
def handle_websocket():
    wsock = request.environ.get('wsgi.websocket')
    if not wsock:
        raise abort(400, 'Expected WebSocket request.')

    try:
        while True:
            message = wsock.receive()
            wsock.send("Your message was: %r" % message)
    except gws.WebSocketError as e:
        print(e)
        
@app.route('/audiows')
def handle_audio():
    wsock = request.environ.get('wsgi.websocket')
    if not wsock:
        raise abort(400, 'Expected WebSocket request.')

    try:

        print("NEW CLIENT CONNECTED")

        while True:

            text = wsock.receive()
            print("GOT TEXT", text)

            if not text:
                print("CLIENT DROPPED (that's ok)")
                break
        
            iter = tts.tts_iter(text, speaker_id)
            print("GOT ITER", iter)

            buf = io.BytesIO()
            
            with sound_file(buf) as fa:

                for audio, word_dur in iter:
                    
                    print("LOOP CHUNK", audio[:25], word_dur)

                    min_val = audio.min()
                    max_val = audio.max()
                    over = np.sum(audio > 1.0)
                    under = np.sum(audio < -1.0)
                    if over or under:
                        print(f"Clipping chunk: min={min_val:.3f}, max={max_val:.3f}")
                        print(f"Clipping {over+under} samples (>{over}, <{under})")
                        audio = np.clip(audio, -1.0, 1.0)
                        asdffs
                        pass

                    pcm_bytes = (audio * 32767).astype("<i2").tobytes()
                    print("PCM", type(pcm_bytes), len(pcm_bytes), pcm_bytes[:25])
                    
                    # write word_dur to buffer
                    wsock.send( json.dumps(word_dur) )

                    wsock.send( pcm_bytes )

                    # write binary audio chunk to fake file
                    #fa.write(audio)
                    #fa.flush()

                    # read from fake file and send binary websocket message
                    #buf.seek(0)
                    #data = buf.read()
                    #wsock.send(data)

                else:
                    print("END LOOP1")

                    wsock.send('EOF')
                    
                    #time.sleep(0.2)
                    #print("END LOOP2")
                    
                    #wsock.close()

    #except (gws.WebSocketConnectionClosed, gws.EofError):
    #    # client closed connection
    #    print("WS CLOSED! (this is fine)")
  
    except gws.WebSocketError as e:
        print(e)


@app.route('/favicon.icoasdfdsaf')
def handle_favicon():
    return ''

@app.route('/asdfasfasdfxs')
def handle_index():
    return '''\
<html>
<head>
  <script type="text/javascript">
    const host = location.host
    const ws = new WebSocket(`ws://${host}/websocket`);
    ws.onopen = function() {
        ws.send("Hello, world");
    };
    ws.onmessage = function (evt) {
        alert(evt.data);
    };
  </script>
</head>
</html>
'''

@app.route('/')
@app.route('/<path>')
def handle_static(path='index.html'):
    return static_file(path, 'html')

if __name__ == '__main__':
    server = gws.WebSocketServer(('', 9009), app)
    #server = gws.WebSocketServer(("127.0.0.1", 9009), app)
    print("SERVE", server)
    raise server.serve_forever()
