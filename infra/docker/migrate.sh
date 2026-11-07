#!/bin/sh
# Ordered, idempotent migration runner for the EFLS PostgreSQL database.
# Applies every *.sql (except *.down.sql) once and records it in
# schema_migrations. Each migration file owns its own transaction.
set -eu

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGUSER:=efls}"
: "${PGDATABASE:=efls}"

psql_do() {
  psql --no-psqlrc -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" "$@"
}

echo "[migrate] waiting for $PGHOST:$PGPORT/$PGDATABASE"
until psql_do -c 'SELECT 1' >/dev/null 2>&1; do
  sleep 1
done

psql_do -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
"

applied_count=0
for file in /migrations/*.sql; do
  case "$file" in
    *.down.sql) continue ;;
  esac

  name="$(basename "$file")"
  if [ "$(psql_do -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$name'")" = "1" ]; then
    echo "[migrate] skip $name"
    continue
  fi

  echo "[migrate] applying $name"
  psql_do -f "$file"
  psql_do -c "INSERT INTO schema_migrations (filename) VALUES ('$name') ON CONFLICT DO NOTHING"
  applied_count=$((applied_count + 1))
done

echo "[migrate] done ($applied_count new migration(s))"
