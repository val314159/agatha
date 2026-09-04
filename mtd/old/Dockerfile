FROM alpine:latest
RUN apk add --no-cache \
    tini nginx supervisor python3 py3-pip py-virtualenv \
    make postgresql postgresql-contrib postgresql-client
RUN pip install --break-system-packages --no-cache \
    celery psycopg2-binary kombu sqlalchemy
RUN echo >>/root/.profile 'alias ll="ls -la"'
RUN echo >>/root/.profile 'alias gen="generate.sh src/mtd/models.py workflows tasks relations jobs"'
ARG NGINX_HTTP_PORT=8080
ARG NGINX_HTTPS_PORT=1443
ARG POSTGRES_PORT=5432
ARG POSTGRES_USER=myuser
ARG POSTGRES_DB=mydatabase
ENV PGDATA=/var/lib/postgresql/data
ENV PGHOST=127.0.0.1
ENV PGPORT=$POSTGRES_PORT
ENV PGUSER=$POSTGRES_USER
ENV PGDATABASE=$POSTGRES_DB
ENV PYTHONPATH=/app/src
ARG NGINX_CONF=/etc/nginx/http.d/default.conf
RUN sed -i -E "s/listen[[:space:]]+80([[:space:];])/listen ${NGINX_HTTP_PORT}\1/g" $NGINX_CONF \
 && sed -i -E "s/listen[[:space:]]+\\[::\\]:80([[:space:];])/listen [::]:${NGINX_HTTP_PORT}\1/g" $NGINX_CONF \
 && sed -i -E "s/listen[[:space:]]+443([[:space:]]+ssl[[:space:];])/listen ${NGINX_HTTPS_PORT}\1/g" $NGINX_CONF \
 && sed -i -E "s/listen[[:space:]]+\\[::\\]:443([[:space:]]+ssl[[:space:];])/listen [::]:${NGINX_HTTPS_PORT}\1/g" $NGINX_CONF
RUN sed -i -E 's!127.0.0.1/32!all!g' /usr/share/postgresql/pg_hba.conf.sample
RUN mkdir -p             /run/nginx /var/lib/nginx /var/log/nginx \
 && chown -R nginx:nginx /run/nginx /var/lib/nginx /var/log/nginx
RUN mkdir -p                   /var/run/postgresql /var/lib/postgresql/data \
 && chown -R postgres:postgres /var/run/postgresql /var/lib/postgresql/data
RUN touch    /usr/local/bin/mtd-launch \
 && chmod +x /usr/local/bin/mtd-launch \
 && cat    > /usr/local/bin/mtd-launch <<'SH'
#!/bin/sh
set -eu
p_sql() {
  user=$1; db=$2; shift 2
  psql -U "$user" -d "$db" -v ON_ERROR_STOP=1 "$@"; }
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p                   "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su  postgres -c "initdb -D '$PGDATA'"
fi
su postgres -c "pg_ctl -D '$PGDATA' -w -l /var/lib/postgresql/logfile \
  -o '-c listen_addresses=0.0.0.0 -p $PGPORT' start"
if [ ! -f "$PGDATA/.mtd-init-complete" ]; then
  p_sql postgres postgres -c "CREATE USER \"$PGUSER\";"
  p_sql postgres postgres -c "CREATE DATABASE \"$PGDATABASE\" OWNER \"$PGUSER\";"
  for sql_file in /docker-entrypoint-initdb.d/*.sql; do
    p_sql "$PGUSER" "$PGDATABASE" -f "$sql_file"
  done
  touch "$PGDATA/.mtd-init-complete"
fi
exec supervisord -c /etc/supervisord.conf
SH
ENV CELERY_APP=mtd.worker
ENV CELERY_LOG_LEVEL=info
RUN cat > /etc/supervisord.conf <<'CONF'
[supervisord]
nodaemon=true
user=root
[program:nginx]
command=nginx -g "daemon off;"
[program:celery-worker]
command=su app -s /bin/sh -c "celery worker"
[program:celery-beat]
command=su app -s /bin/sh -c "celery beat"
CONF
RUN    adduser -D -h /app app
COPY             src /app/src
WORKDIR              /app
RUN chown -R app:app /app
RUN mkdir -p     /docker-entrypoint-initdb.d/
RUN cp src/sql/* /docker-entrypoint-initdb.d/
RUN cp src/scripts/* /usr/local/bin
ENTRYPOINT ["tini"]
CMD ["mtd-launch"]
EXPOSE 5432
