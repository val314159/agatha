import os


def db_url() -> str:
    user = os.environ["PGUSER"]
    host = os.environ["PGHOST"]
    port = os.environ["PGPORT"]
    database = os.environ["PGDATABASE"]
    return f"postgresql+psycopg2://{user}@{host}:{port}/{database}"
