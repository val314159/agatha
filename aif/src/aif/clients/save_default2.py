#!/usr/bin/env python3
import json
import os
import sys
import time
import uuid
from memoriesdb.lib.db import save_template


PROMPT_PATH = os.getenv('PROMPT_PATH', os.path.join('prompts', 'agatha.1.0.txt'))

MODEL = os.getenv('MODEL', 'test')


if __name__ == '__main__':

    with open(PROMPT_PATH, 'r', encoding='utf-8') as fh:
        system_prompt = ''.join(
            line for line in fh.readlines()
            if not line.lstrip().startswith('#')
        ).strip()

    if not system_prompt:
        raise SystemExit(f'Prompt file is empty: {PROMPT_PATH}')

    row = save_template(
        system_prompt=system_prompt,
        name='Default',
        slug='default',
        model=MODEL,
        title_template='Agatha',
        user_id='00000000-0000-0000-0000-000000000000',
    )

    print("ROW", row)

