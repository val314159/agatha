#!/usr/bin/env python3
'''
Usage:
  harness.py
'''

import os, docopt
from datetime import datetime
from pathlib import Path

from openai import OpenAI

OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL',
                            'http://n:9090/v1/')

MODEL = os.getenv('MODEL', 'dolphin')

SYSTEM = 'system'
USER = 'user'
ASST = 'assistant'

Client = OpenAI(
    base_url=OPENAI_BASE_URL,
    api_key=os.getenv('OPENAI_API_KEY', 'not-needed'),
)

Messages = []


def prin(*a,**kw):
    print(*a,**kw, end='', flush=True)
    return


def reset_convo():
    prompt_template = (Path(__file__).parent / 'prompts/templates/elise.md').read_text()
    start_template = (Path(__file__).parent / 'prompts/templates/elise.md').read_text()
    
    args = dict(
        CURRENT_TIME = datetime.now().isoformat(),
        MEETING_TYPE = 'morning executive meeting',
        MEETING_START_TIME = '9am sharp',
        USER_NAME = 'val',
    )
    prompt = prompt_template.format(**args)
    start = start_template.format(**args)
    Messages.clear()
    Messages.append(dict(
        role = SYSTEM,
        content = prompt))
    Messages.append(dict(
        role = USER,
        content = start))
    return 


def call_ai():
    content_arr = []
    try:
        for response in Client.chat.completions.create(
                model=MODEL,
                messages=Messages,
                stream=True):
            content = response.choices[0].delta.content
            if content is None:
                continue
            content_arr.append(content)
            prin(content)
            pass
        print("¶")
    except:
        Messages.pop()
        raise
    return content_arr


def get_input():
    while True:
        prin('> ')
        user_input = input()
        if user_input:
            return user_input
        pass
    pass

def meeting_loop():
    while True:
        content_arr = call_ai()
        Messages.append(dict(role=ASST,
                             content=''.join(content_arr)))
        print("=======")
        user_input = get_input()
        if user_input:
            Messages.append(dict(role=USER,
                                 content=user_input))
            pass
        pass
    return


def main(args):
    print("ARGS", args)
    reset_convo()
    try:
        meeting_loop()
    except KeyboardInterrupt:
        print('^C')
    except EOFError:
        print('^D')
        pass
    return


if __name__ == '__main__':
    main(docopt.docopt(__doc__))
