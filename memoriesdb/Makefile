
# Postgres Variables
PG = pg15
PG_PORT = 54321
PG_CONTAINER_NAME = pgvector
PG_DATA_DIR = ./data/postgres

U=uv run --env-file=.env 

# Docker run options - use env file for most vars, override port
V = --rm --env-file=.env -p${PG_PORT}:5432 \
	--name pgvector pgvector/pgvector:0.8.0-${PG}

P=postgres://$$POSTGRES_USER:$$POSTGRES_PASSWORD@localhost:5432/$$POSTGRES_DB

all:: setup modelfiles

dev:: reset-db

reset-db:
	bash restart_db.sh

modelfiles::
	make -C modelfiles

chat::
	$U -m memoriesdb.cli.chat6 TEST LAST

test::
	uv run pytest tests/ -v

ipython:
	$U .env ipython

db-connect:
	docker exec -it ${PG_CONTAINER_NAME} bash -c 'psql $P'

pgvector-start: _pgvector-start pgvector-wait-1 reset-db

pgvector-wait-1: pgvector-wait
	sleep 2

_pgvector-start:
	docker run -d ${V}
	@echo "PostgreSQL with pgvector started, waiting for it to be ready..."
	make pgvector-wait
	@echo "PostgreSQL with pgvector is ready on port ${PG_PORT}"

pgvector-stop:
	docker rm -f pgvector || true
	@echo "PostgreSQL container stopped and removed"

pgvector-restart: pgvector-stop pgvector-start

pgvector-wait:
	@echo "Waiting for PostgreSQL to be ready..."
	@until docker logs pgvector 2>&1 | grep -q "database system is ready to accept connections"; do \
		echo -n "."; \
		sleep 0.1; \
	done
	@echo "\nPostgreSQL is ready!"

clean::
	rm -fr *.out *.err *.log
	@find .	-name \*~ -o -name .\*~ | xargs rm -fr

realclean:: clean
	@find .	-name __pycache__ -o -name .venv -o \
		-name \#\*\# -o -name .\#\* | xargs rm -fr
	@rm -fr uv.lock
	@tree -I .git -a
setup::
	if docker ps | grep pgvector; then make reset-db; else make pgvector-restart; fi

vtoken:
	ssh -i ~/.ssh/id_vastai $$(vastai ssh-url $$(vastai show instances -q)) 'echo $$OPEN_BUTTON_TOKEN'

hub:
	uv run --env-file=.env memoriesdb/services/hub.py
