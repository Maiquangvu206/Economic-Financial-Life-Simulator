# EFLS deployment on the self-hosted Ubuntu server

This deployment uses the root `docker-compose.yml` and a GitHub Actions
self-hosted runner. It serves the player app at `/`, the admin app at `/admin/`,
the API at `/api/`, and Socket.IO at `/socket.io/`. Tailscale Serve terminates
HTTPS and proxies to Nginx at `127.0.0.1:3000` inside the shared network
namespace.

## One-time server setup

Run as `mq` on the server:

```bash
cd /srv/apps/project-1
if [ ! -f .env ]; then cp .env.example .env; fi
chmod 600 .env
mkdir -p ts-config
docker network inspect ai-net >/dev/null 2>&1 || docker network create ai-net
```

Edit `.env` and replace the Tailscale auth key and all secret placeholders.
Choose a URL-safe Postgres password because the Compose file places it in a
Postgres connection URL. Set `PUBLIC_ORIGIN` to the exact HTTPS origin. Keep
`.env` only on the server; it is ignored by Git and excluded from the Docker
build context. `ts-config/serve.json` is tracked so deploys can sync its Serve
settings; do not put credentials in that file.

Create `/srv/apps/project-1/ts-config/serve.json` on the host and configure
Tailscale Serve to proxy HTTPS to `http://127.0.0.1:3000`. The supported file
format can be exported from a configured Tailscale Serve instance with
`tailscale serve status --json`; `TS_SERVE_CONFIG` expects Tailscale's Serve
configuration format. Mount the containing directory as Compose does, not the
individual JSON file. Persisted `tailscale-state` keeps the node identity.

The Docker external network `ai-net` must exist before Compose starts. It is
attached to both the Tailscale sidecar and AI service for future AI module
connectivity. Application databases and backend ports are not published on the
Ubuntu host.

The Compose project is named `efls`. Its database/cache/Tailscale volumes keep
the explicit names `project-1_postgres-data`, `project-1_redis-data`, and
`project-1_tailscale-state` so changing the Compose project name does not switch
to empty volumes. The deploy workflow backs up and migrates using the previous
Compose project, then stops its containers without deleting volumes before
starting the new project.

The database, Redis, and Tailscale state volumes have explicit stable names.
`docker compose up -d --build` preserves them. Do not use `docker compose down
-v` or remove `project-1_*` volumes when updating code.

## First start and automatic deployments

The runner must execute as `mq`, and `/srv/apps/project-1` must be a Git
checkout whose `origin` can pull `main` non-interactively. The workflow in
`.github/workflows/deploy.yml` runs on pushes to `main` and manual dispatch:

```bash
cd /srv/apps/project-1
git pull --ff-only origin main
docker compose config --quiet
./scripts/backup-production-db.sh
docker compose run --rm migrate
docker compose up -d --build
docker compose ps
```

Each deployment creates and validates a PostgreSQL custom-format backup before
running migrations or replacing application containers. Backups are kept under
`/srv/backups/project-1/postgres` for 30 days; a failed backup stops deployment.
The migration step runs explicitly on every deploy so newly added SQL files are
not skipped just because the one-shot Compose service already exited earlier.
The workflow also blocks edits or removals of existing migration files; add a
new migration instead. New migrations can still intentionally change data, so
review them and test against a restored staging copy before rollout. There is
no automatic restore: recovery uses the validated pre-deploy dump. Keep another
copy off-server to protect against disk or host loss. Configure GitHub branch
protection so CI checks pass before changes reach `main`.

For routine manual updates after the Compose project has transitioned to
`efls`, run the guarded sequence after pulling code:

```bash
git pull --ff-only origin main
docker compose config --quiet
bash scripts/backup-production-db.sh
docker compose run --rm migrate
docker compose up -d --build
docker compose ps
```

Use the GitHub workflow for the first transition from the previous Compose
project name: it captures the old project name, backs up/migrates against its
database, stops the old containers without deleting volumes, then starts the
new project. Do not manually run `docker compose up` across that transition.

## Checks and operations

```bash
docker compose ps
docker compose logs --tail=200 web-app tailscale api-gateway realtime
curl -fsS http://127.0.0.1:3000/healthz
```

The local HTTP health check is inside the Tailscale container network
namespace. From an authorized tailnet device, verify:

- `https://project1.zorse-mizar.ts.net/`
- `https://project1.zorse-mizar.ts.net/admin/`
- API requests under `/api/`
- Socket.IO/WebSocket connection under `/socket.io/`

`AllowFunnel` is enabled in the Serve config as requested. This permits Funnel
use for the node; tailnet policy and a Funnel configuration are still required
to publish a service publicly. Keep the proxy target and public exposure in
mind when changing this setting.

Useful rollback: check out the previous known-good commit in the server
checkout, then run `docker compose up -d --build`. Restore the database from a
verified backup only when the application/schema change requires it.
