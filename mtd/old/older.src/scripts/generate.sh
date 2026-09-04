#!/bin/sh
set -eu
if [ ! -x .v/bin/python ]; then 
    rm -fr .v
    virtualenv .v
    .v/bin/python -m pip -q install -U pip
    .v/bin/python -m pip -q install sqlacodegen psycopg2-binary inflect
fi
.v/bin/python -m mtd.generate "$@"
