#!/usr/bin/env python3
import re

from aif.lib.wsutil import *


def repeat(thunk, exit_on_true=True, delay=0):
    while 1:
        ret = thunk() 
        if exit_on_true and ret:
            return ret
        if delay:
            time.sleep(delay)
            pass
        pass
    return


VISION_MODEL = os.getenv('VISION_MODEL', 'vision')

ANSI_RE = re.compile(r'\x1b\[[0-9;?]*[A-Za-z]')

# Set KEEP_UPLOADS=1 to retain images+markers after analysis (debugging).
KEEP_UPLOADS = os.getenv('KEEP_UPLOADS', '').lower() in ('1', 'true', 'yes')

PROMPT = (
    'Respond only in JSON. Analyze this webcam snapshot for an AI assistant. '
    'Return: description (short scene description), people_count (integer), '
    'looking_at_camera (boolean or null), wants_to_talk (yes/no/maybe), '
    'engagement_confidence (number 0-1), notable_objects (list of strings).'
)


def analyze_image(path):
    # ollama run detects image paths inside the prompt text, not as
    # separate argv elements — the path must be embedded in the prompt.
    cmd = ['ollama', 'run', VISION_MODEL, PROMPT + ' Image: ' + path]
    print("CMD", cmd)
    res = subp.run(cmd, capture_output=True, text=True, timeout=300)
    if res.returncode != 0:
        return {'error': 'ollama exited %s' % res.returncode,
                'stderr': res.stderr.strip()[-500:]}
    # The CLI emits spinner/ANSI control codes on both streams; strip them.
    out = ANSI_RE.sub('', res.stdout).strip()
    try:
        return orjson.loads(out)
    except Exception:
        pass
    # Model may wrap JSON in prose; grab the outermost {...} block.
    start, end = out.find('{'), out.rfind('}')
    if 0 <= start < end:
        try:
            return orjson.loads(out[start:end + 1])
        except Exception:
            pass
    return {'description': out}


def main():
    in_channel = 'vid-in'
    out_channel = 'vid-out'

    os.makedirs(VIDEO_DIR, exist_ok=True)

    ws = ws_connect(in_channel)

    seen = set()

    def process(fn):
        image = os.path.join(VIDEO_DIR, fn[:-4])
        print("ANALYZE", image)
        try:
            obs = analyze_image(image)
        except Exception as e:
            obs = {'error': str(e)}
        obs.pop('channel', None)
        obs.update(type='scene_observation', image_id=fn[:-4])
        print("OBS", obs)
        pub(ws, out_channel, **obs)
        if not KEEP_UPLOADS:
            for f in (fn, fn[:-4]):
                try:
                    os.remove(os.path.join(VIDEO_DIR, f))
                except OSError:
                    pass
        pass

    def once():
        current = set(os.listdir(VIDEO_DIR))
        for fn in sorted(current - seen):
            if fn.endswith('.DUN'):
                process(fn)
        seen.clear()
        seen.update(current)
        pass

    gevent.spawn(lambda:repeat(once,0,0.1))

    while 1:
        print("Waiting on socket...")
        msg = recv(ws)
        print("Got", (msg,), "!")

        method = msg.get('method')
        params = msg.get('params',{})

        if method=='initialize':
            print("INIT", params)

        elif method=='pub':
            # vid-in commands (capture_request etc.) not yet defined; log only.
            print("PUB", params)

        else:
            print("*"*80)
            print("ERROR, BAD PACKET", msg)
            print("*"*80)
            pass

        time.sleep(0.2)
        pass

    return print("EOF")


if __name__=='__main__':
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    main()
