from memoriesdb import db


def main():
    user_id = db.get_current_user_id()
    convo = db.get_last_conversation(user_id)

    if not convo:
        print("No conversation found")
        return

    print(f"Conversation {convo['id']}: {convo['content']}")
    for msg in db.load_simplified_convo(str(convo["id"]), user_id):
        print(msg)


if __name__ == "__main__":
    main()

