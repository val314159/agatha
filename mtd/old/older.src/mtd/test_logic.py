from __future__ import annotations

from mtd.models import Job, JobState, Workflow


def test_relation_satisfied() -> None:
    workflow = Workflow(id="relation_probe")
    decision = workflow.add_task("decision", "YesNoDecision", value="yes")
    yes_target = workflow.add_task("yes_target", "YesNoDecision")
    no_target = workflow.add_task("no_target", "YesNoDecision")

    decision.link(yes_target, kind="yes")
    decision.link(no_target, kind="no")

    assert [relation.kind for relation in decision.out_links()] == ["yes", "no"]
    assert [relation.kind for relation in yes_target.in_links()] == ["yes"]
    assert [(relation.kind, relation.satisfied()) for relation in decision.out_links()] == [
        ("yes", True),
        ("no", False),
    ]


def test_any_all() -> None:
    workflow = Workflow(id="gate_probe")
    yes_source = workflow.add_task("yes_source", "YesNoDecision", value="yes")
    no_source = workflow.add_task("no_source", "YesNoDecision", value="no")
    any_gate = workflow.add_task("any_gate", "Any")
    all_gate = workflow.add_task("all_gate", "All")

    yes_source.link(any_gate, kind="yes")
    no_source.link(any_gate, kind="yes")
    yes_source.link(all_gate, kind="yes")
    no_source.link(all_gate, kind="yes")

    assert any_gate.satisfies() is True
    assert all_gate.satisfies() is False

    no_source.meta = {**no_source.meta, "value": "yes"}
    assert all_gate.satisfies() is True


def test_file_exists() -> None:
    workflow = Workflow(id="file_probe")
    existing = workflow.add_task("existing", "FileExists", path="/tmp")
    missing = workflow.add_task("missing", "FileExists", path="/definitely/not/here")

    assert existing.exists() is True
    assert missing.exists() is False


def test_make_task_result_predicates() -> None:
    workflow = Workflow(id="make_probe")
    task = workflow.add_task("build", "MakeProcess")

    assert task.success() is False
    assert task.failure() is False

    task.jobs.append(
        Job(
            id="failed",
            celery_task_id="failed",
            job_state=JobState.FAILURE,
        )
    )
    assert task.success() is False
    assert task.failure() is True

    task.jobs.append(
        Job(
            id="succeeded",
            celery_task_id="succeeded",
            job_state=JobState.SUCCESS,
        )
    )
    assert task.success() is True
    assert task.failure() is False


def main() -> None:
    test_relation_satisfied()
    test_any_all()
    test_file_exists()
    test_make_task_result_predicates()
    print("logic ok")


if __name__ == "__main__":
    main()
