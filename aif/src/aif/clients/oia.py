#!/usr/bin/env python3
from gevent import monkey as _; _.patch_all()
import os
import sys

from openai import OpenAI


MODEL = os.getenv('MODEL', 'test')
OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', 'dummy')
SYSTEM_PROMPT = os.getenv('SYSTEM_PROMPT', '')


def build_client():
    kwargs = {'api_key': OPENAI_API_KEY}
    if OPENAI_BASE_URL:
        kwargs['base_url'] = OPENAI_BASE_URL
    return OpenAI(**kwargs)


def readline():
    print('user>', end=' ', flush=True)
    return sys.stdin.readline()


def main():
    client = build_client()
    messages = []
    if SYSTEM_PROMPT:
        messages.append({'role': 'system', 'content': SYSTEM_PROMPT})

    while True:
        content = readline()
        if not content:
            break
        content = content.strip()
        if not content:
            continue
        if content in {'/quit', '/exit'}:
            break

        messages.append({'role': 'user', 'content': content})
        stream = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            stream=True,
        )

        print('assistant>', end=' ', flush=True)
        parts = []
        for chunk in stream:
            delta = chunk.choices[0].delta
            text = getattr(delta, 'content', None)
            if not text:
                continue
            print(text, end='', flush=True)
            parts.append(text)
        print()

        reply = ''.join(parts).strip()
        messages.append({'role': 'assistant', 'content': reply})


if __name__ == '__main__':
    main()
