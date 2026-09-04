import os

from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from mtd.models import Relation, Task, TaskState, Workflow

from mtd.db_url import db_url


def build_workflow() -> Workflow:
    workflow = Workflow(
        id="cool_graph",
        display_name="Cool Graph",
        meta={"kind": "example", "shape": "fanout-diamond-merge"},
    )
    
    ingest = workflow.add_task("ingest", "YesNoDecision", "Ingest Raw Events", group="input")
    profile = workflow.add_task("profile", "YesNoDecision", "Profile Inputs", group="quality")
    clean = workflow.add_task("clean", "YesNoDecision", "Clean Records", group="quality")
    enrich_users = workflow.add_task("enrich_users", "YesNoDecision", "Enrich Users", group="enrich")
    enrich_accounts = workflow.add_task("enrich_accounts", "YesNoDecision", "Enrich Accounts", group="enrich")
    score = workflow.add_task("score", "YesNoDecision", "Score Risk", group="model")
    audit = workflow.add_task("audit", "YesNoDecision", "Audit YesNoDecisions", group="control")
    publish = workflow.add_task("publish", "YesNoDecision", "Publish Snapshot", group="output")
    notify = workflow.add_task("notify", "YesNoDecision", "Notify Subscribers", group="output")

    ingest.link(profile, clean, kind='ingested')
    profile.link(enrich_users)
    clean.link(enrich_users, enrich_accounts)
    enrich_users.link(score)
    enrich_accounts.link(score, audit)
    score.link(publish)
    audit.link(publish)
    publish.link(notify)

    return workflow


def main() -> None:
    engine = create_engine(db_url())
    workflow = build_workflow()

    with Session(engine) as session:
        session.execute(delete(Workflow).where(Workflow.id == workflow.id))
        session.add(workflow)
        session.commit()

        saved = Workflow.load(session, workflow.id)
        if saved is None:
            raise RuntimeError("workflow was not saved")
        saved.print_graph()


if __name__ == "__main__":
    main()
