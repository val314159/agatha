from __future__ import annotations

import os

from .models import Task, JobState


class TaskPeer:

    WATCHER  = False
    MANUAL   = False
    PROCESS  = False
    COMPLETE = False

    def __init__(self, peer: Task):
        self._peer = peer
        return

    def in_links(self):
        return self._peer.in_links()

    def out_links(self):
        return self._peer.out_links()

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        try:
            return self._peer.meta[name]
        except KeyError:
            raise AttributeError(name) from None

    def _get(self, name):
        return self._peer.meta.get(name)

    pass


class Watcher(TaskPeer):

    WATCHER = True

    pass


class ManualProcess(TaskPeer):

    MANUAL = True

    def start(self):
        self._peer.set_state(TaskState.RUNNING)

    def complete(self):
        self._peer.set_state(TaskState.DONE)

    def block(self, reason=None):
        self._peer.meta = {**self._peer.meta, "blocked_reason": reason}
        self._peer.set_state(TaskState.BLOCKED)
    
    pass


class Process(TaskPeer):

    PROCESS  = False

    pass


class MakeProcess(Process):
    '''
    use celery to run "make <task_id>"
    '''

    def start(self) -> str | None:
        from .celery_tasks import run_make

        target = self._get("target")
        cwd = self._get("cwd")

        job_id = self._peer.create_job({"target": target, "cwd": cwd})
        
        if job_id is None:
            return None
            
        run_make.apply_async(
            task_id=job_id,
            args=(
                self._peer.workflow_id,
                self._peer.id,
                target,
                cwd,
            ),
        )
        return job_id

    def reset(self) -> str | None:
        from .celery_tasks import run_clean

        target = "clean"
        cwd = self._get("cwd")
        
        job_id = self._peer.create_job({"target": target, "cwd": cwd})
        
        if job_id is None:
            return None
            
        run_clean.apply_async(
            task_id=job_id,
            args=(
                self._peer.workflow_id,
                self._peer.id,
                cwd,
            ),
        )
        return job_id

    def success(self):
        job = self._latest_job()
        return job is not None and job.job_state == JobState.SUCCESS

    def failure(self):
        job = self._latest_job()
        return job is not None and job.job_state == JobState.FAILURE

    def _latest_job(self):
        jobs = list(self._peer.jobs)
        if not jobs:
            return None
        return max(
            jobs,
            key=lambda job: (
                job.created_at is not None,
                job.created_at,
                job.id,
            ),
        )

    pass


class Any(Watcher):

    STYLE = 'circle plus'

    def satisfies(self):
        is_satisfied = False
        for in_link in self._peer.in_links():
            if in_link.satisfied():
                is_satisfied = True
                # don't break, we'll give all the dependencies a chance to run
                pass
            pass
        return is_satisfied

    pass


class All(Watcher):

    STYLE = 'circle dot'

    def satisfies(self):
        is_satisfied = True
        for in_link in self._peer.in_links():
            if not in_link.satisfied():
                is_satisfied = False
                # don't break, we'll give all the dependencies a chance to run
                pass
            pass
        return is_satisfied

    pass


class Complete(All):

    STYLE = 'double circle'

    COMPLETE = True

    pass


class Decision(Watcher):

    STYLE = 'diamond'
    
    pass


class YesNoDecision(Decision):

    def yes(self):
        return self.value == 'yes'

    def no(self):
        return self.value == 'no'

    pass


class FileExists(Watcher):
    
    def exists(self):
        try:
            os.stat(self.path)
            return True
        except FileNotFoundError:
            return False
        pass

    def missing(self):
        return not self.exists()

    pass
