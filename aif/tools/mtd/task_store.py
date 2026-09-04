import json
import os
import sqlite3
from pathlib import Path


STATES = {"IDLE", "RUNNING", "AWAITING", "READY", "ERROR", "DONE"}
KNOWN_FIELDS = {
    "id",
    "title",
    "notes",
    "state",
    "deadline",
    "reason",
    "python_class",
    "relations",
    "depends_on",
    "dependants",
}
DEFAULT_DB = "~/.mtd-llm/tasks.sqlite3"
SEED_FILE = "data.json"


def db_path():
    return Path(os.path.expanduser(os.getenv("MTD_TASK_DB", DEFAULT_DB)))


def connect():
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("pragma foreign_keys = on")
    init_db(con)
    seed_if_empty(con)
    return con


def init_db(con):
    con.execute(
        """
        create table if not exists tasks (
          id text primary key,
          title text not null default '',
          notes text not null default '',
          state text not null check (state in ('IDLE', 'RUNNING', 'AWAITING', 'READY', 'ERROR', 'DONE')),
          deadline text,
          reason text,
          python_class text,
          meta text not null default '{}',
          created_at text not null default current_timestamp,
          updated_at text not null default current_timestamp
        )
        """
    )
    con.execute(
        """
        create table if not exists relations (
          source_id text not null references tasks(id) on delete cascade,
          target_id text not null references tasks(id) on delete cascade,
          kind text not null default 'satisfies',
          created_at text not null default current_timestamp,
          primary key (source_id, kind, target_id)
        )
        """
    )
    con.execute("create index if not exists relations_idx on relations(target_id)")
    con.commit()


def seed_if_empty(con):
    count = con.execute("select count(*) from tasks").fetchone()[0]
    if count:
        return
    if not os.path.exists(SEED_FILE):
        return
    with open(SEED_FILE) as f:
        rows = json.load(f)
    for row in rows:
        try:
            task = dict(row)
            task.pop("relations", None)
            task.pop("depends_on", None)
            task.pop("dependants", None)
            create_task(con, task, task_id=row.get("id"))
        except sqlite3.IntegrityError:
            pass
    for row in rows:
        append_relations(con, row.get("id"), row.get("relations"))
        append_depends_on(con, row.get("id"), row.get("depends_on"))
        append_dependants(con, row.get("id"), row.get("dependants"))
    con.commit()


def split_task(payload):
    task = {k: payload[k] for k in KNOWN_FIELDS if k in payload}
    meta = {k: v for k, v in payload.items() if k not in KNOWN_FIELDS}
    if "state" in task:
        task["state"] = normalize_state(task["state"])
    return task, meta


def split_relation(payload, default_source=None):
    relation = {
        "source_id": payload.get("source_id") or payload.get("source") or default_source,
        "target_id": payload.get("target_id") or payload.get("target"),
        "kind": payload.get("kind") or payload.get("name") or payload.get("type") or "satisfies",
    }
    missing = [k for k, v in relation.items() if not v]
    if missing:
        raise ValueError(f"relation missing {', '.join(missing)}")
    return relation


def normalize_state(state):
    state = str(state).upper()
    if state not in STATES:
        raise ValueError(f"invalid state: {state}")
    return state


def row_to_task(row):
    task = dict(row)
    meta = json.loads(task.pop("meta") or "{}")
    for key in ("created_at", "updated_at"):
        task.pop(key, None)
    task.update(meta)
    return {k: v for k, v in task.items() if v is not None}


def add_relations(con, tasks):
    if not tasks:
        return tasks
    by_id = {task["id"]: task for task in tasks}
    for task in tasks:
        task["depends_on"] = []
        task["dependants"] = []
    marks = ",".join("?" for _ in by_id)
    rows = con.execute(
        f"""
        select * from relations
         where source_id in ({marks}) or target_id in ({marks})
         order by created_at, source_id, kind, target_id
        """,
        [*by_id, *by_id],
    ).fetchall()
    for row in rows:
        relation = dict(row)
        relation.pop("created_at", None)
        if relation["source_id"] in by_id:
            by_id[relation["source_id"]]["dependants"].append(as_related(relation, "target_id"))
        if relation["target_id"] in by_id:
            by_id[relation["target_id"]]["depends_on"].append(as_related(relation, "source_id"))
    for task in tasks:
        if not task["depends_on"]:
            task.pop("depends_on")
        if not task["dependants"]:
            task.pop("dependants")
    return tasks


def as_related(relation, other_key):
    related = {
        "kind": relation["kind"],
        "id": relation[other_key],
    }
    return related


def list_tasks(con, states=None):
    args = []
    where = ""
    if states:
        states = [normalize_state(s) for s in states]
        where = f"where state in ({','.join('?' for _ in states)})"
        args.extend(states)
    rows = con.execute(
        f"select * from tasks {where} order by created_at, id",
        args,
    ).fetchall()
    return add_relations(con, [row_to_task(row) for row in rows])


def get_task(con, task_id):
    row = con.execute("select * from tasks where id = ?", (task_id,)).fetchone()
    if row is None:
        raise ValueError(f"task not found: {task_id}")
    return add_relations(con, [row_to_task(row)])[0]


def search_tasks(con, query=None, states=None):
    tasks = list_tasks(con, states)
    if not query:
        return tasks
    needle = str(query).lower()
    return [
        task for task in tasks
        if needle in json.dumps(task, sort_keys=True).lower()
    ]


def get_agenda(con):
    tasks = list_tasks(con, ["RUNNING", "READY", "ERROR", "AWAITING", "IDLE"])
    return {
        "active": [task for task in tasks if task["state"] == "RUNNING"],
        "ready": [task for task in tasks if task["state"] == "READY"],
        "errors": [task for task in tasks if task["state"] == "ERROR"],
        "awaiting": [task for task in tasks if task["state"] == "AWAITING"],
        "idle": [task for task in tasks if task["state"] == "IDLE"],
    }


def get_blocked(con):
    tasks = list_tasks(con, ["READY", "ERROR"])
    return {
        "ready": [task for task in tasks if task["state"] == "READY"],
        "errors": [task for task in tasks if task["state"] == "ERROR"],
    }


def complete_task(con, payload):
    task_id = payload.get("id")
    if not task_id:
        raise ValueError("complete_task requires id")
    note = (
        payload.get("notes")
        or payload.get("completion_note")
        or payload.get("summary")
    )
    update = {"id": task_id, "state:replace": "DONE"}
    if note:
        update["notes:append"] = note
    update_task(con, update)
    return get_task(con, task_id)


def replace_relations(con, task_id, relations):
    con.execute("delete from relations where source_id = ?", (task_id,))
    append_relations(con, task_id, relations)


def append_relations(con, task_id, relations):
    for payload in relations or []:
        relation = split_relation(payload, default_source=task_id)
        con.execute(
            """
            insert or ignore into relations (source_id, target_id, kind)
            values (?, ?, ?)
            """,
            (
                relation["source_id"],
                relation["target_id"],
                relation["kind"],
            ),
        )


def append_depends_on(con, task_id, relations):
    append_relations(
        con,
        task_id,
        [
            {
                **payload,
                "source_id": payload.get("source_id") or payload.get("source") or payload.get("id"),
                "target_id": payload.get("target_id") or payload.get("target") or task_id,
            }
            for payload in relations or []
        ],
    )


def append_dependants(con, task_id, relations):
    append_relations(
        con,
        task_id,
        [
            {
                **payload,
                "source_id": payload.get("source_id") or payload.get("source") or task_id,
                "target_id": payload.get("target_id") or payload.get("target") or payload.get("id"),
            }
            for payload in relations or []
        ],
    )


def next_task_id(con):
    rows = con.execute("select id from tasks where id glob 'task-[0-9]*'").fetchall()
    max_num = 0
    for row in rows:
        try:
            max_num = max(max_num, int(row["id"].split("-", 1)[1]))
        except (IndexError, ValueError):
            pass
    return f"task-{max_num + 1:02d}"


def create_task(con, payload, task_id=None):
    payload = dict(payload)
    task, meta = split_task(payload)
    relations = task.pop("relations", [])
    depends_on = task.pop("depends_on", [])
    dependants = task.pop("dependants", [])
    task_id = task_id or task.get("id") or next_task_id(con)
    state = task.get("state", "IDLE")
    con.execute(
        """
        insert into tasks (id, title, notes, state, deadline, reason, python_class, meta)
        values (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            task.get("title", ""),
            task.get("notes", ""),
            state,
            task.get("deadline"),
            task.get("reason"),
            task.get("python_class"),
            json.dumps(meta, sort_keys=True),
        ),
    )
    append_relations(con, task_id, relations)
    append_depends_on(con, task_id, depends_on)
    append_dependants(con, task_id, dependants)
    con.commit()
    return task_id


def update_task(con, payload):
    task_id = payload.get("id")
    if not task_id:
        raise ValueError("update_task requires id")

    row = con.execute("select * from tasks where id = ?", (task_id,)).fetchone()
    if row is None:
        raise ValueError(f"task not found: {task_id}")

    current = row_to_task(row)
    for key, value in payload.items():
        if key == "id":
            continue
        if ":" in key:
            field, op = key.rsplit(":", 1)
        else:
            field, op = key, "replace"
        if field == "relations" and op == "replace":
            replace_relations(con, task_id, value)
        elif field == "relations" and op == "append":
            append_relations(con, task_id, value)
        elif field == "depends_on" and op == "replace":
            con.execute("delete from relations where target_id = ?", (task_id,))
            append_depends_on(con, task_id, value)
        elif field == "depends_on" and op == "append":
            append_depends_on(con, task_id, value)
        elif field == "dependants" and op == "replace":
            con.execute("delete from relations where source_id = ?", (task_id,))
            append_dependants(con, task_id, value)
        elif field == "dependants" and op == "append":
            append_dependants(con, task_id, value)
        elif op == "replace":
            current[field] = value
        elif op == "append":
            old = current.get(field) or ""
            current[field] = f"{old}\n{value}" if old else str(value)
        else:
            raise ValueError(f"unsupported update op: {op}")

    task, meta = split_task(current)
    con.execute(
        """
        update tasks
           set title = ?,
               notes = ?,
               state = ?,
               deadline = ?,
               reason = ?,
               python_class = ?,
               meta = ?,
               updated_at = current_timestamp
         where id = ?
        """,
        (
            task.get("title", ""),
            task.get("notes", ""),
            task.get("state", "IDLE"),
            task.get("deadline"),
            task.get("reason"),
            task.get("python_class"),
            json.dumps(meta, sort_keys=True),
            task_id,
        ),
    )
    con.commit()


def read_payload():
    raw = os.sys.stdin.read().strip()
    return json.loads(raw) if raw else {}


def dump(body):
    return json.dumps(body, indent=2) + "\n"
