.PHONY: docker-fg docker-bg sh exec kill all gen clean realclean test build

D=--name=mtd -p127.0.0.1:5432:5432 -d \
	-v`pwd`:`pwd` -v`pwd`/mtd-pgdata:/var/lib/postgresql/data

docker-fg: .docker-build-mtd.stamp
	docker run -it --rm $D mtd || rm -fr mtd-pgdata

docker-bg: .docker-build-mtd.stamp
	docker run -d  --rm $D mtd

sh: .docker-build-mtd.stamp
	docker run -it --rm $D -w`pwd` mtd sh --login

.docker-build-mtd.stamp: Dockerfile src build
	touch $@

build:
	rm -fr mtd-pgdata
	docker build -t mtd .

exec:
	docker exec -it -w`pwd` mtd sh --login

kill:
	docker exec -it mtd killall -9 supervisord

clean:
	rm -fr *.log
	find . -name    \*~  | xargs rm -fr
	find . -name   .\*~  | xargs rm -fr
	find . -name  \#\*\# | xargs rm -fr
	find . -name .\#\*   | xargs rm -fr

realclean: clean
	rm -fr .uv-cache
	rm -fr .docker-build-mtd.stamp
	rm -fr mtd-pgdata uv.lock models.py
	find . -name __pycache__ | xargs rm -fr
	find . -name .v\*        | xargs rm -fr
	tree -I .git -I .kelvin -I old.src -asF
