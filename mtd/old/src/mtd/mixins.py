from __future__ import annotations


class WorkflowMixin:
    pass

class TaskMixin:
    @property
    def peer(self):
        from mtd import tasks
        name = f'{self.python_class}Task'
        return getattr(tasks, name)(self)
    pass

class JobMixin:
    pass

class RelationMixin:
    pass

