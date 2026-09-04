from __future__ import annotations

from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from mtd.db_url import db_url
from mtd.models import Workflow


MAKEFILE = """
.PHONY: shop prep mix shape bake rest glaze potatoes serve clean

shop:
\t@echo DOING shop
\t@sleep 1
\t@echo DONE shop

prep:
\t@echo DOING prep
\t@sleep 2
\t@echo DONE prep

mix:
\t@echo DOING mix
\t@sleep 3
\t@echo DONE mix

shape:
\t@echo DOING shape
\t@sleep 1
\t@echo DONE shape

bake:
\t@echo DOING bake
\t@sleep 5
\t@echo DONE bake

rest:
\t@echo DOING rest
\t@sleep 2
\t@echo DONE rest

glaze:
\t@echo DOING glaze
\t@sleep 1
\t@echo DONE glaze

potatoes:
\t@echo DOING potatoes
\t@sleep 4
\t@echo DONE potatoes

serve:
\t@echo DOING serve
\t@sleep 1
\t@echo DONE serve

clean:
\t@echo DOING clean
\t@sleep 1
\t@echo DONE clean
""".lstrip()


def build_workflow() -> Workflow:
    workflow = Workflow(
        id="meatloaf",
        display_name="Make Meatloaf",
        meta={"kind": "example", "domain": "cooking"},
    )

    shop = workflow.add_task("shop", "MakeProcess", "Buy Ingredients", target="shop")
    prep = workflow.add_task("prep", "MakeProcess", "Prep Ingredients", target="prep")
    mix = workflow.add_task("mix", "MakeProcess", "Mix Meatloaf", target="mix")
    shape = workflow.add_task("shape", "MakeProcess", "Shape Loaf", target="shape")
    bake = workflow.add_task("bake", "MakeProcess", "Bake Meatloaf", target="bake")
    rest = workflow.add_task("rest", "MakeProcess", "Rest Meatloaf", target="rest")
    glaze = workflow.add_task("glaze", "MakeProcess", "Make Glaze", target="glaze")
    potatoes = workflow.add_task("potatoes", "MakeProcess", "Make Potatoes", target="potatoes")
    serve = workflow.add_task("serve", "MakeProcess", "Serve Dinner", target="serve")
    done = workflow.add_task("done", "Complete", "Dinner Is Ready")

    shop.link(prep)
    prep.link(mix, glaze, potatoes)
    mix.link(shape)
    shape.link(bake)
    glaze.link(bake)
    bake.link(rest)
    rest.link(serve)
    potatoes.link(serve)
    serve.link(done)

    return workflow


def main() -> None:
    with open("/app/Makefile", "w", encoding="utf-8") as makefile:
        makefile.write(MAKEFILE)

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
