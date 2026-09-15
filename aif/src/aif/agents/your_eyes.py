#!/usr/bin/env python3
import re
import shlex

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


VISION_MODEL = os.getenv('VISION_MODEL', 'llama3.2-vision')

# 'ollama' (default) or 'codex' — codex pipes the prompt to stdin and
# passes the image via -i, billed against the ChatGPT plan quota.
VISION_BACKEND = os.getenv('VISION_BACKEND', 'ollama')

ANSI_RE = re.compile(r'\x1b\[[0-9;?]*[A-Za-z]')

# Set KEEP_UPLOADS=1 to retain images+markers after analysis (debugging).
KEEP_UPLOADS = os.getenv('KEEP_UPLOADS', '').lower() in ('1', 'true', 'yes')

PROMPT = (
    'Respond only in JSON. Analyze this webcam snapshot for an AI assistant. '
    'Return: description (short scene description), people_count (integer), '
    'looking_at_camera (boolean or null), wants_to_talk (yes/no/maybe), '
    'engagement_confidence (number 0-1), notable_objects (list of strings).'
)
PROMPT = 'what is this? '

def analyze_image(path):
    if VISION_BACKEND == 'codex':
        # Verified invocation: prompt piped to stdin, image via -i.
        cmd = 'echo %s | codex exec -i %s' % (shlex.quote(PROMPT), shlex.quote(path))
        print("CMD", cmd)
        res = subp.run(cmd, shell=True, capture_output=True,
                       text=True, timeout=300)
    else:
        # ollama run detects image paths inside the prompt text, not as
        # separate argv elements — the path must be embedded in the prompt.
        cmd = ['ollama', 'run', VISION_MODEL, PROMPT + ' Image: ' + path]
        print("CMD", cmd)
        res = subp.run(cmd, capture_output=True, text=True, timeout=300)
    if res.returncode != 0:
        return {'error': '%s exited %s' % (VISION_BACKEND, res.returncode),
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
        tell_agatha(image, obs)
        if not KEEP_UPLOADS:
            for f in (fn, fn[:-4], fn[:-4] + '.json'):
                try:
                    os.remove(os.path.join(VIDEO_DIR, f))
                except OSError:
                    pass
        pass

    def tell_agatha(image, obs):
        # Route the observation through sup-in so it becomes a normal
        # voice turn: filler -> LLM -> TTS -> avatar.
        if 'error' in obs:
            return
        meta = {}
        try:
            meta = orjson.loads(Path(image + '.json').read_bytes())
        except Exception:
            pass
        if not meta.get('session_id'):
            print("TELL skipped: no session metadata for", image)
            return
        desc = obs.get('description') or orjson.dumps(obs).decode()
        extras = ', '.join(f'{k}={v}' for k, v in obs.items()
                           if k in ('people_count', 'looking_at_camera',
                                    'wants_to_talk') and v is not None)
        if extras:
            desc += f' ({extras})'
        content = ('[Camera snapshot] The user just showed you their webcam. '
                   'You see: ' + desc +
                   ' Comment on what you see naturally, in a sentence or two.')
        turn = dict(role='user', content=content, generate_audio=True,
                    turn_id=str(uuid.uuid4()), **meta)
        print("TELL", turn)
        pub(ws, 'sup-in', **turn)

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
