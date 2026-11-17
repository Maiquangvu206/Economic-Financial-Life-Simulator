#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The self-hosted runner account (mq) owns the checkout but may not be allowed
# to create directories directly under /srv. Keep deploy snapshots in an
# ignored, server-local directory inside the checkout by default; operators can
# override this with DEPLOY_BACKUP_DIR for a separately mounted backup disk.
backup_dir="${DEPLOY_BACKUP_DIR:-$PWD/.deploy-backups/postgres}"
compose_project="${DEPLOY_DB_COMPOSE_PROJECT:-}"
install -d -m 700 "$backup_dir"
chmod 700 "$backup_dir"
umask 077

timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
temporary_dump="$(mktemp "$backup_dir/.project-1-${timestamp}.XXXXXX.tmp")"
backup_dump="$backup_dir/project-1-${timestamp}.dump"
trap 'rm -f "$temporary_dump"' EXIT

# A failed dump or invalid archive stops the deployment before Compose can
# apply database migrations or replace application containers.
compose_args=()
if [[ -n "$compose_project" ]]; then
  compose_args=(-p "$compose_project")
fi

docker compose "${compose_args[@]}" exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --no-owner --no-acl --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$temporary_dump"
test -s "$temporary_dump"

docker run --rm --network none \
  --mount "type=bind,source=$temporary_dump,target=/backup.dump,readonly" \
  postgres:16-alpine pg_restore --list /backup.dump >/dev/null

mv "$temporary_dump" "$backup_dump"
sha256sum "$backup_dump" > "$backup_dump.sha256"
trap - EXIT

# Keep the most recent 30 days of pre-deploy snapshots on this host.
find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'project-1-*.dump' -o -name 'project-1-*.dump.sha256' \) \
  -mtime +30 -delete

printf 'Validated PostgreSQL backup: %s\n' "$backup_dump"
