from .mixins import *
from typing import Optional
import datetime
import enum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKeyConstraint, Index, PrimaryKeyConstraint, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass


class JobState(str, enum.Enum):
    PENDING = 'PENDING'
    RUNNING = 'RUNNING'
    SUCCESS = 'SUCCESS'
    FAILURE = 'FAILURE'


class TaskState(str, enum.Enum):
    IDLE = 'IDLE'
    WAITING = 'WAITING'
    RUNNING = 'RUNNING'
    BLOCKED = 'BLOCKED'
    DONE = 'DONE'


class Workflow(WorkflowMixin, Base):
    __tablename__ = 'workflows'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='workflows_pkey'),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    frozen: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    display_name: Mapped[Optional[str]] = mapped_column(Text)

    tasks: Mapped[list['Task']] = relationship('Task', back_populates='workflow')


class Task(TaskMixin, Base):
    __tablename__ = 'tasks'
    __table_args__ = (
        ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE', name='tasks_workflow_id_fkey'),
        PrimaryKeyConstraint('workflow_id', 'id', name='tasks_pkey')
    )

    workflow_id: Mapped[str] = mapped_column(Text, primary_key=True)
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    task_state: Mapped[TaskState] = mapped_column(Enum(TaskState, values_callable=lambda cls: [member.value for member in cls], name='task_state'), nullable=False, server_default=text("'IDLE'::task_state"))
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    display_name: Mapped[Optional[str]] = mapped_column(Text)
    python_class: Mapped[Optional[str]] = mapped_column(Text)

    workflow: Mapped['Workflow'] = relationship('Workflow', back_populates='tasks')
    jobs: Mapped[list['Job']] = relationship('Job', back_populates='task')
    relations_workflow_sources: Mapped[list['Relation']] = relationship('Relation', foreign_keys='[Relation.workflow_id, Relation.source_id]', back_populates='workflow_source')
    relations_workflow_targets: Mapped[list['Relation']] = relationship('Relation', foreign_keys='[Relation.workflow_id, Relation.target_id]', back_populates='workflow_target', overlaps='relations_workflow_sources')


class Job(JobMixin, Base):
    __tablename__ = 'jobs'
    __table_args__ = (
        ForeignKeyConstraint(['task_workflow_id', 'task_id'], ['tasks.workflow_id', 'tasks.id'], ondelete='CASCADE', name='jobs_task_workflow_id_task_id_fkey'),
        PrimaryKeyConstraint('id', name='jobs_pkey'),
        UniqueConstraint('celery_task_id', name='jobs_celery_task_id_key'),
        Index('jobs_task_id_idx', 'task_workflow_id', 'task_id')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    task_workflow_id: Mapped[str] = mapped_column(Text, nullable=False)
    task_id: Mapped[str] = mapped_column(Text, nullable=False)
    celery_task_id: Mapped[str] = mapped_column(Text, nullable=False)
    job_state: Mapped[JobState] = mapped_column(Enum(JobState, values_callable=lambda cls: [member.value for member in cls], name='job_state'), nullable=False, server_default=text("'PENDING'::job_state"))
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    started_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    finished_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    task: Mapped['Task'] = relationship('Task', back_populates='jobs')


class Relation(RelationMixin, Base):
    __tablename__ = 'relations'
    __table_args__ = (
        ForeignKeyConstraint(['workflow_id', 'source_id'], ['tasks.workflow_id', 'tasks.id'], ondelete='CASCADE', name='relations_workflow_id_source_id_fkey'),
        ForeignKeyConstraint(['workflow_id', 'target_id'], ['tasks.workflow_id', 'tasks.id'], ondelete='CASCADE', name='relations_workflow_id_target_id_fkey'),
        PrimaryKeyConstraint('workflow_id', 'source_id', 'kind', 'target_id', name='relations_pkey'),
        Index('relations_idx', 'workflow_id', 'target_id')
    )

    workflow_id: Mapped[str] = mapped_column(Text, primary_key=True)
    source_id: Mapped[str] = mapped_column(Text, primary_key=True)
    target_id: Mapped[str] = mapped_column(Text, primary_key=True)
    kind: Mapped[str] = mapped_column(Text, primary_key=True, server_default=text("'satisfies'::text"))

    workflow_source: Mapped['Task'] = relationship('Task', foreign_keys=[workflow_id, source_id], back_populates='relations_workflow_sources', overlaps='relations_workflow_targets')
    workflow_target: Mapped['Task'] = relationship('Task', foreign_keys=[workflow_id, target_id], back_populates='relations_workflow_targets', overlaps='relations_workflow_sources,workflow_source')
