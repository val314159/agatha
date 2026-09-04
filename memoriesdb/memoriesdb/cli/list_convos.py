from gevent import monkey as _;_.patch_all()
import sys

from memoriesdb.lib.db import get_user_conversations, get_current_user_id


def main():
    print("LIST CONVOS")
    # find all sessions for a user

    try:
        uuid = sys.argv[1]
    except IndexError:
        uuid = get_current_user_id()
        pass

    for row in get_user_conversations(uuid):
        print(row)
        print(f"Conversation {row['id']}: {row['content']}")
        pass
    pass

    
if __name__=='__main__': main()

