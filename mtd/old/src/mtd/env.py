import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session


def db_url() -> str:
    user = os.environ["PGUSER"]
    host = os.environ["PGHOST"]
    port = os.environ["PGPORT"]
    database = os.environ["PGDATABASE"]
    return f"postgresql+psycopg2://{user}@{host}:{port}/{database}"


DB_URL = db_url()

engine = create_engine(DB_URL)
