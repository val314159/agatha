from pidwatcher import PidFileWatcher


def main():
    PidFileWatcher("hub.ready").wait()
    print("hub is ready")


if __name__ == "__main__":
    main()

