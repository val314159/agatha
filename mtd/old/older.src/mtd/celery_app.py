from celery import Celery

from .db_url import db_url


DB_URL = db_url()

celery = Celery(
    "mtd",
    broker=f"sqla+{DB_URL}",
    backend=f"db+{DB_URL}",
    include=["mtd.celery_tasks"],
)

celery.config_from_object("mtd.schedule")
