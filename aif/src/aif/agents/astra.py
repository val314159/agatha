#!/usr/bin/env python3
"""Astra: Codex-CLI-backed task agent.

Listens on codex-in for {content: <task>, uuid, session_id, conversation},
runs the task in a persistent `codex app-server` session (JSON-RPC over
stdio, one JSONL message per line), and speaks Astra's reply verbatim
through aud-in.
"""
import re
import html

from aif.lib.wsutil import *

IN_CHANNEL = 'codex-in'

# Where codex writes files.
WORK_DIR = os.path.realpath(os.getenv('ASTRA_WORK_DIR', './astra_workspace'))

ANSI_RE = re.compile(r'\x1b\[[0-9;?]*[A-Za-z]')

# Ask codex for a speakable reply so Agatha can read it verbatim.
VOICE_SUFFIX = (
    '\n\nWhen finished, reply in one or two conversational sentences as if '
    'spoken aloud by an assistant named Astra. Do not include code blocks, '
    'file contents, or markdown in the reply.')

TURN_TIMEOUT = 600

SENTENCE_END = re.compile(r'[.!?]+["\')\]]*\s')


class CodexSession:
    """Persistent `codex app-server` subprocess speaking JSONL JSON-RPC."""

    def __init__(self, cwd):
        self.proc = subp.Popen(
            ['codex', 'app-server', '--listen', 'stdio://'],
            stdin=subp.PIPE, stdout=subp.PIPE, stderr=None,
            text=True, cwd=cwd)
        self._id = 0
        self.events = q.Queue()      # notifications (no id)
        self.responses = {}          # id -> response payload
        self.thread_id = None
        gevent.spawn(self._reader)
        self._call('initialize', {
            'clientInfo': {'name': 'astra', 'version': '0.1.0'}})
        self._notify('initialized', {})
        res = self._call('thread/start', {'cwd': cwd})
        self.thread_id = (res.get('thread') or {}).get('id')
        print("CODEX THREAD", self.thread_id)
        if not self.thread_id:
            raise RuntimeError('thread/start returned no thread id')

    def _reader(self):
        for line in self.proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception:
                print("CODEX RAW", line[:200])
                continue
            if 'id' in msg and ('result' in msg or 'error' in msg):
                self.responses[msg['id']] = msg
            else:
                self.events.put(msg)
        self.events.put({'method': 'eof'})

    def _send(self, msg):
        self.proc.stdin.write(json.dumps(msg) + '\n')
        self.proc.stdin.flush()

    def _call(self, method, params, timeout=30):
        self._id += 1
        rid = self._id
        self._send({'id': rid, 'method': method, 'params': params})
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = self.responses.pop(rid, None)
            if msg is not None:
                if 'error' in msg:
                    raise RuntimeError('%s: %s' % (method, msg['error']))
                return msg.get('result') or {}
            time.sleep(0.05)
        raise TimeoutError('%s timed out' % method)

    def _notify(self, method, params):
        self._send({'method': method, 'params': params})

    def run_task(self, task, speak=None):
        """Submit one turn; stream sentences to speak(text, done) as they
        complete; return (final_agent_text, command_outputs, error)."""
        self._call('turn/start', {
            'threadId': self.thread_id,
            'input': [{'type': 'text', 'text': task + VOICE_SUFFIX}],
            'cwd': WORK_DIR,
            'approvalPolicy': 'never',
            'sandboxPolicy': {'type': 'workspaceWrite',
                              'writableRoots': [WORK_DIR],
                              'networkAccess': True},
        })
        deltas = {}
        outputs = []
        final_text = ''
        buf = ''
        deadline = time.time() + TURN_TIMEOUT
        while time.time() < deadline:
            try:
                ev = self.events.get(timeout=0.5)
            except q.Empty:
                continue
            method = ev.get('method', '')
            params = ev.get('params', {})
            if method == 'item/agentMessage/delta':
                delta = params.get('delta', '')
                deltas[params.get('itemId')] = \
                    deltas.get(params.get('itemId'), '') + delta
                buf += delta
                # Flush each completed sentence to TTS immediately.
                while speak:
                    m = SENTENCE_END.search(buf)
                    if not m:
                        break
                    sent, buf = buf[:m.end()].strip(), buf[m.end():]
                    if sent:
                        speak(sent, False)
            elif method == 'item/completed':
                item = params.get('item', {})
                print("ITEM", item.get('type'),
                      (item.get('command') or '')[:80])
                if item.get('type') in ('commandExecution', 'fileChange'):
                    print("CMDITEM", json.dumps(item)[:600])
                if item.get('type') == 'agentMessage':
                    final_text = item.get('text', '')
                elif item.get('type') == 'commandExecution':
                    o = item.get('aggregatedOutput')
                    cmd = item.get('command') or ''
                    m = re.match(r"/bin/\w+ -l?c ['\"](.*)['\"]$",
                                 cmd, re.S)
                    if m:
                        cmd = m.group(1)
                    if cmd:
                        outputs.append('$ ' + cmd)
                    if o:
                        outputs.append(o)
                elif item.get('type') == 'fileChange':
                    for ch in item.get('changes') or []:
                        d = ch.get('diff')
                        if d:
                            outputs.append(
                                '# ' + (ch.get('path') or 'file') +
                                '\n' + d)
            elif method == 'turn/completed':
                status = (params.get('turn') or {}).get('status')
                if status and status != 'completed':
                    return None, outputs, 'turn status: %s' % status
                if speak:
                    speak(buf.strip(), True)
                return final_text or ''.join(deltas.values()) or \
                    '(no output)', outputs, None
            elif method == 'eof':
                return None, outputs, 'codex app-server exited'
            elif method in ('error', 'turn/error'):
                return None, outputs, json.dumps(params)[:300]
        return None, outputs, 'turn timed out'


def main():
    os.makedirs(WORK_DIR, exist_ok=True)

    ws = ws_connect(IN_CHANNEL)

    session = CodexSession(WORK_DIR)

    def handle(params):
        task = (params.get('content') or params.get('task') or '').strip()
        meta = {k: params[k] for k in ('uuid', 'session_id', 'conversation')
                if params.get(k)}
        if not task or not meta.get('session_id'):
            print("SKIP", params)
            return
        # Instant filler straight to TTS while codex works.
        pub(ws, 'aud-in', content='On it.', done=True,
            turn_id=str(uuid.uuid4()), **meta)
        turn_id = str(uuid.uuid4())
        first = [True]

        def speak(text, done):
            if first[0]:
                first[0] = False
                text = 'Astra said: ' + (text or 'Done.')
            if text or done:
                pub(ws, 'aud-in', content=text, done=done,
                    turn_id=turn_id, **meta)

        out, cmd_outputs, err = session.run_task(task, speak=speak)
        if err:
            speak('Astra hit an error: ' + err, True)
        spoken = 'Astra said: ' + (out or err or '')
        print("REPORT", spoken[:300])
        # Echo to the session's sup-out so it lands in history without
        # triggering another LLM turn.
        pub(ws, 'sup-out::' + meta['session_id'], role='assistant',
            content=spoken, turn_id=turn_id, kind='astra')
        # Command echoes, outputs, and file diffs display as text,
        # not voice -- each in its own bubble.
        for block in cmd_outputs:
            block = block.strip()
            if not block:
                continue
            print("PRE", block[:120])
            pub(ws, 'sup-out::' + meta['session_id'], role='assistant',
                content='<pre>' + html.escape(block) + '</pre>',
                turn_id=turn_id, kind='astra')

    while 1:
        print("Waiting on socket...")
        msg = recv(ws)
        print("Got", (msg,), "!")

        method = msg.get('method')
        params = msg.get('params', {})

        if method == 'initialize':
            print("INIT", params)

        elif method == 'pub':
            if params.get('channel') == IN_CHANNEL:
                gevent.spawn(handle, params)
            else:
                print("PUB(other)", params)

        else:
            print("*" * 80)
            print("ERROR, BAD PACKET", msg)
            print("*" * 80)
            pass

        time.sleep(0.2)
        pass

    return print("EOF")


if __name__ == '__main__':
    PidFileWatcher("pubsub.ready", "dbs.ready").wait()
    main()
