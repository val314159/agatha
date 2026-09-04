#!/usr/bin/env python3
'''
Usage:
    list_prompts [--all] [--inactive] [--json]
    list_prompts --help
    list_prompts --version

Options:
    -h, --help     Show this screen and exit.
    -v, --version  Show this screen and exit.
    --all          List all matching versions instead of only the latest per slug.
    --inactive     Include inactive templates too.
    --json         Print structured JSON.
'''
from gevent import monkey as _; _.patch_all()
import json
import os
import sys

import docopt



def main():
    args = docopt.docopt(__doc__, version='1.0.0')
    '''
    from memoriesdb.lib.db import list_templates

    rows = list_templates(
        all_versions=bool(args['--all']),
        active_only=not bool(args['--inactive']),
    )

    if args['--json']:
        print(json.dumps(rows, indent=2, sort_keys=True))
        return

    if not rows:
        return

    for row in rows:
        status = 'active' if row.get('active') else 'inactive'
        model = row.get('model') or '-'
        title_template = row.get('title_template') or '-'
        print(f"{row['slug']} v{row['version']} [{status}]")
        print(f"  id: {row['id']}")
        print(f"  name: {row['name']}")
        print(f"  model: {model}")
        print(f"  title: {title_template}")
'''

if __name__ == '__main__':
    main()

