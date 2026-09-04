#!/usr/bin/env python3
'''
'''
import os, dotenv
dotenv.load_dotenv()

from memoriesdb.lib.db import get_user_conversations, load_simplified_convo, create_event

UUID = os.getenv('UUID')

if __name__=='__main__':
    from docopt import docopt

    for row in get_user_conversations(UUID):
        print("Conversation row=%r", row)
        print("Conversation %s: %s", row['id'], row['content'])
        #results.append([str(row['id']), row['content']])
