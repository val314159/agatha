#!/usr/bin/env python3
from __future__ import annotations

import os, argparse

from typing import Any, Mapping

from sqlalchemy import create_engine
from sqlalchemy.schema import MetaData

from sqlacodegen.generators import DeclarativeGenerator
from sqlacodegen.models import ColumnAttribute, Model, ModelClass, RelationshipAttribute, RelationshipType


class MtdGenerator(DeclarativeGenerator):
    def generate(self) -> str:
        return "from .mixins import *\n" + super().generate()

    def render_class_declaration(self, model: ModelClass) -> str:
        parent_class_name = (
            model.parent_class.name if model.parent_class else self.base_class_name
        )
        if parent_class_name == self.base_class_name:
            return f"class {model.name}({model.name}Mixin, {parent_class_name}):"

        return f"class {model.name}({parent_class_name}):"

    def render_relationship_arguments(
        self, relationship: RelationshipAttribute
    ) -> Mapping[str, Any]:
        def render_column_attrs(column_attrs: list[ColumnAttribute]) -> str:
            rendered = []
            render_as_string = False
            for attr in column_attrs:
                if not self.explicit_foreign_keys and attr.model is relationship.source:
                    rendered.append(attr.name)
                else:
                    rendered.append(f"{attr.model.name}.{attr.name}")
                    render_as_string = True

            joined = "[" + ", ".join(rendered) + "]"
            return repr(joined) if render_as_string else joined

        def render_foreign_keys(column_attrs: list[ColumnAttribute]) -> str:
            rendered = []
            render_as_string = False
            for attr in column_attrs:
                if not self.explicit_foreign_keys and attr.model is relationship.source:
                    rendered.append(attr.name)
                else:
                    rendered.append(f"{attr.model.name}.{attr.name}")
                    render_as_string = True

            if render_as_string:
                return "'[" + ", ".join(rendered) + "]'"
            else:
                return "[" + ", ".join(rendered) + "]"

        def render_join(terms: list[tuple[ModelClass, str, ModelClass | Model, str]]) -> str:
            rendered_joins = []
            for source, source_col, target, target_col in terms:
                rendered = f"{source.name}.{source_col} == {target.name}."
                if target.__class__ is Model:
                    rendered += "c."

                rendered += str(target_col)
                rendered_joins.append(rendered)

            if len(rendered_joins) > 1:
                self.add_literal_import("sqlalchemy", "and_")
                return "lambda: and_(" + ", ".join(rendered_joins) + ")"
            else:
                return "lambda: " + rendered_joins[0]

        kwargs: dict[str, Any] = {}
        if relationship.type is RelationshipType.ONE_TO_ONE and relationship.constraint:
            if relationship.constraint.referred_table is relationship.source.table:
                kwargs["uselist"] = False

        if relationship.association_table:
            table_ref = relationship.association_table.table.name
            if relationship.association_table.schema:
                table_ref = f"{relationship.association_table.schema}.{table_ref}"

            kwargs["secondary"] = repr(table_ref)

        if relationship.remote_side:
            kwargs["remote_side"] = render_column_attrs(relationship.remote_side)

        if relationship.foreign_keys:
            kwargs["foreign_keys"] = render_foreign_keys(relationship.foreign_keys)

        if relationship.primaryjoin:
            kwargs["primaryjoin"] = render_join(relationship.primaryjoin)

        if relationship.secondaryjoin:
            kwargs["secondaryjoin"] = render_join(relationship.secondaryjoin)

        if relationship.backref:
            kwargs["back_populates"] = repr(relationship.backref.name)

        overlaps = self.render_relationship_overlaps(relationship)
        if overlaps:
            kwargs["overlaps"] = repr(overlaps)

        return kwargs

    def render_relationship_overlaps(
        self, relationship: RelationshipAttribute
    ) -> str | None:
        if relationship.source.name == "Task" and relationship.target.name == "Relation":
            if relationship.name == "relations_workflow_targets":
                return "relations_workflow_sources"

        if relationship.source.name == "Relation" and relationship.target.name == "Task":
            if relationship.name == "workflow_source":
                return "relations_workflow_targets"
            if relationship.name == "workflow_target":
                return "relations_workflow_sources,workflow_source"

        return None


def generate_sqlalchemy(dburl: str, tables: list[str]) -> str:
    engine = create_engine(dburl)
    metadata = MetaData()
    generator = MtdGenerator(metadata, engine, ["use_inflect"])
    metadata.reflect(engine, views=generator.views_supported, only=tables)
    return generator.generate()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("outfile")
    parser.add_argument("tables", nargs="+")
    parser.add_argument(
        "--dburl",
        default=os.environ.get("DBURL")
        or f"postgresql+psycopg2://{os.environ.get('PGUSER')}@{os.environ.get('PGHOST')}/{os.environ.get('PGDATABASE')}",
    )
    args = parser.parse_args()

    if not args.dburl or "None" in args.dburl:
        raise SystemExit("DBURL must be set, or PGUSER/PGHOST/PGDATABASE must be set")

    print(f"generating from {','.join(args.tables)}...")
    output = generate_sqlalchemy(args.dburl, args.tables)
    with open(args.outfile,'w') as f:
        f.write(output)


if __name__ == "__main__":
    main()
