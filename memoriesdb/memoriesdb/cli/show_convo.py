from gevent import monkey as _;_.patch_all()
import sys, time, json

from memoriesdb.lib.db import get_last_conversation, get_current_user_id, load_simplified_convo


def main():
    print("SHOW CONVOS")
    # find all sessions for a user

    try:
        uuid = sys.argv[2] 
    except IndexError:
        uuid = get_current_user_id()
        pass

    try:
        conversation_id = sys.argv[1]
        while conversation_id.endswith(':'):
            conversation_id = conversation_id[:-1]
            pass
    except IndexError:
        row = get_last_conversation(uuid)
        print("ROW:", row)
        conversation_id = str(row['id'])
        pass

    for x in load_simplified_convo(conversation_id, uuid):
        print("  -", x)
    
    pass

    
if __name__=='__main__': main()

