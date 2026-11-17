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
cp .env.example .env
chmod 600 .env
mkdir -p ts-config
docker network inspect ai-net >/dev/null 2>&1 || docker network create ai-net
```

Edit `.env` and replace the Tailscale auth key and all secret placeholders.
Choose a URL-safe Postgres password because the Compose file places it in a
Postgres connection URL. Set `PUBLIC_ORIGIN` to the exact HTTPS origin. Keep
`.env` and `ts-config/serve.json` only on the server; both paths are ignored by
Git and excluded from the Docker build context.

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

This Compose project is named `project-1`, so its named database/cache volumes
are separate from volumes created by the older `infra/docker/docker-compose.yml`
project (`efls`). If that older stack contains data that must be retained,
export/import it or deliberately migrate the volume before the first start;
do not run both Postgres containers against the same data directory.

## First start and automatic deployments

The runner must execute as `mq`, and `/srv/apps/project-1` must be a Git
checkout whose `origin` can pull `main` non-interactively. The workflow in
`.github/workflows/deploy.yml` runs on pushes to `main` and manual dispatch:

```bash
cd /srv/apps/project-1
git pull --ff-only origin main
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

On the first start, Compose builds the player/admin web image and all backend
images, runs database migrations, and starts the services. A failed build or
migration causes the workflow to fail. The workflow does not implement
automatic database rollback; take a database backup before the first
production migration and before schema changes that may drop or rewrite data.
Configure GitHub branch protection so CI checks must pass before changes can
reach `main`.

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

Useful rollback: check out the previous known-good commit in the server
checkout, then run `docker compose up -d --build`. Restore the database from a
verified backup only when the application/schema change requires it.
