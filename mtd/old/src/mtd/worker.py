from celery import Celery

from mtd.env import DB_URL


celery = Celery(
    "mtd",
    broker=f"sqla+{DB_URL}",
    backend=f"db+{DB_URL}",
    include=["mtd.jobs"],
)

celery.config_from_object("mtd.schedule")
