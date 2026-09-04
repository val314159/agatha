from __future__ import annotations

import subprocess

from celery.utils.log import get_task_logger
from sqlalchemy import select
from sqlalchemy.orm import Session

from mtd.worker import celery
from mtd.models import Job, JobState, TaskState

from mtd.env import engine


logger = get_task_logger(__name__)

    
def update_job_state_to_running_maybe(self) -> bool:

    with Session(engine) as session:
        job = session.execute(
            select(Job)
            .where(Job.id == self.request.id)
            .with_for_update()
        ).scalar_one_or_none()

        if job is None:
            raise RuntimeError(f"job not found for celery task {self.request.id}")

        if job.job_state != JobState.PENDING:
            return False

        job.job_state = JobState.RUNNING
        job.task.task_state = TaskState.RUNNING
        session.commit()
        return True


def update_job_state_to_done(self, result) -> None:

    with Session(engine) as session:
        job = session.get(Job, self.request.id)
        if job is None:
            raise RuntimeError(f"job disappeared while running {self.request.id}")

        job.meta = {
            **job.meta,
            "returncode": result.returncode,
            "stdout": result.stdout[-20000:],
            "stderr": result.stderr[-20000:],
        }

        if result.returncode == 0:
            job.job_state = JobState.SUCCESS
            job.task.task_state = TaskState.DONE
        else:
            job.job_state = JobState.FAILURE
            job.task.task_state = TaskState.BLOCKED

        session.commit()
        return


def update_job_state_to_idle(self, result) -> None:

    with Session(engine) as session:
        job = session.get(Job, self.request.id)
        if job is None:
            raise RuntimeError(f"job disappeared while running {self.request.id}")

        job.meta = {
            **job.meta,
            "returncode": result.returncode,
            "stdout": result.stdout[-20000:],
            "stderr": result.stderr[-20000:],
        }

        if result.returncode == 0:
            job.job_state = JobState.SUCCESS
            job.task.task_state = TaskState.IDLE
        else:
            job.job_state = JobState.FAILURE
            job.task.task_state = TaskState.BLOCKED

        session.commit()
        return


@celery.task(bind=True, name="mtd.jobs.run_make")
def run_make(self, workflow_id: str, task_id: str, target: str, cwd: str | None = None):

    updated = update_job_state_to_running_maybe(self)

    if not updated:
        logger.warning(
            "refusing to run make job for %s/%s because it is already in-process",
            workflow_id,
            task_id,
        )
        return None

    result = subprocess.run(
        ["make", target],
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )

    update_job_state_to_done(self, result)

    return result.returncode


@celery.task(bind=True, name="mtd.jobs.run_clean")
def run_clean(self, workflow_id: str, task_id: str, cwd: str | None = None):

    updated = update_job_state_to_running_maybe(self)

    if not updated:
        logger.warning(
            "refusing to run clean job for %s/%s because it is already in-process",
            workflow_id,
            task_id,
        )
        return None

    result = subprocess.run(
        ["make", "clean"],
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )

    update_job_state_to_idle(self, result)

    return result.returncode


@celery.task(name="mtd.jobs.step")
def step():
    print("step done")
