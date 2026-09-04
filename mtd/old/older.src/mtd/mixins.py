from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import Workflow, Task, Relation, Job

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session


class WorkflowMixin:

    @staticmethod
    def load(session: Session, workflow_id: str):
        from .models import Workflow

        return session.get(Workflow, workflow_id)

    def add_task(self: Workflow, task_id: str, python_class: str, label: str = None, **meta):
        from .models import Task, TaskState

        return Task(
            workflow=self,
            id=task_id,
            display_name=label or task_id,
            task_state=TaskState.IDLE,
            python_class=python_class,
            meta=meta,
        )

    def print_graph(self: Workflow) -> None:
        print(f"workflow: {self.id} ({self.display_name})")
        for task in self.tasks:
            targets = ", ".join(
                f"{relation.workflow_target.id} [{relation.kind}]"
                for relation in task.relations_workflow_sources
            ) or "-"
            print(f"  {task.id:15s} -> {targets}")
            pass
        print("\ndigraph cool_graph {")
        for task in self.tasks:
            print(f'  "{task.id}" [label="{task.display_name}"];')
            pass
        for task in self.tasks:
            for relation in task.relations_workflow_sources:
                print(
                    f'  "{task.id}" -> "{relation.workflow_target.id}" '
                    f'[label="{relation.kind}"];'
                )
                pass
            pass
        print("}")
        return

    pass


class TaskMixin:

    def in_links(self: Task):
        return self.relations_workflow_targets

    def out_links(self: Task):
        return self.relations_workflow_sources

    @property
    def peer(self: Task):
        try:
            return object.__getattribute__(self, "_peer")
        except AttributeError:
            pass

        if not self.python_class:
            raise AttributeError("peer")

        if '.' in self.python_class:
            raise AttributeError("dots not allowed in peer classnames")

        from . import peers

        try:
            peer_class = getattr(peers, self.python_class)
        except AttributeError:
            raise AttributeError(
                f"no peer class named {self.python_class!r}"
            ) from None

        _peer = peer_class(self)
        self._peer = _peer
        return _peer

    def x__getattr__(self: TaskMixin, name: str):
        if name.startswith("_"):
            raise AttributeError(name)

        try:
            return getattr(self.peer, name)
        except AttributeError:
            raise AttributeError(name) from None
    
    def link(self: Task, *targets: Task, kind: str = "satisfies") -> None:
        from .models import Relation

        self.relations_workflow_sources.extend(
            Relation(workflow_target=target, kind=kind)
            for target in targets
        )
        return

    def create_job(self, meta) -> str | None:
        from .models import Task, Job, JobState

        session = object_session(self)
        if session is None:
            raise RuntimeError("create_job() requires a task attached to a session")

        locked_task = session.execute(
            select(Task)
            .where(Task.workflow_id == self.workflow_id, Task.id == self.id)
            .with_for_update() # THIS IS THE LOCK IT LIVES UNTIL COMMIT
        ).scalar_one()

        active_states = {JobState.PENDING, JobState.RUNNING}
        if any(job.job_state in active_states
               for job in locked_task.jobs):
            return None

        job_id = uuid.uuid4().hex
        locked_task.jobs.append(
            Job(id=job_id,
                celery_task_id=job_id,
                job_state=JobState.PENDING,
                meta=meta,
            )
        )
        session.commit()
        return job_id

    pass


class RelationMixin:

    def satisfied(self: Relation) -> bool:
        print("TEST SATISFIED", self.workflow_source)
        print("TEST SATISFIED", self.kind)
        predicate = getattr(self.workflow_source, self.kind)
        return bool(predicate())


class JobMixin:

    def update_job_state(self: Job, new_state: str) -> None:
        return
    
    pass
