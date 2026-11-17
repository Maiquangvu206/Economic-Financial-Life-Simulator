# EFLS deployment readiness

**Assessment date:** 2026-11-17  
**Target:** Ubuntu 26.04.1 LTS, self-hosted GitHub Actions runner as `mq`,
`/srv/apps/project-1`, Docker Compose v2, Tailscale Serve.

## Deployment package

- Root `Dockerfile` builds the player app at `/` and the admin app at
  `/admin/`, then packages both into Nginx.
- Root `docker-compose.yml` runs PostgreSQL, Redis, migrations, game-core,
  API gateway, realtime, worker, AI, Nginx, and the Tailscale sidecar. Only
  Nginx is reachable, on loopback port 3000 in the shared Tailscale network
  namespace. The external Docker network `ai-net` is required.
- `.github/workflows/deploy.yml` runs on the self-hosted runner, pulls `main`
  in `/srv/apps/project-1`, validates Compose config, builds, and starts the
  stack. Configure GitHub branch protection so CI must pass before merges to
  `main`; this deploy job itself is not gated on CI.
- `.env` and `ts-config/serve.json` are host-only and excluded from Git/build
  context. The Tailscale state uses a named persistent volume.

## Checks in this workspace

| Check                                                    | Result                                                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compose configuration using `.env.example`               | Passed (`docker compose config --quiet`)                                                                                                                             |
| Player and admin frontend builds                         | Passed; Vite reports large chunks over 500 kB                                                                                                                        |
| Web image build                                          | Passed after fixing workspace dependency build order                                                                                                                 |
| Nginx config in the web image                            | Passed (`nginx -t`)                                                                                                                                                  |
| Backend and AI Docker image builds                       | Passed; `game-core`, `api-gateway`, `realtime`, `worker`, and `ai` images built. pnpm emitted a non-fatal missing Vite bin warning during game-core deploy packaging |
| Full stack startup against production-shaped topology    | Not run; no production secrets, Tailscale config, or server resources used                                                                                           |
| Browser/API/realtime smoke tests through the tailnet URL | Not run; requires the configured server and authorized tailnet client                                                                                                |

Earlier repository checks found failing automated tests and lint errors. Those
results need a fresh run against the current branch before deployment. The
existing `CI` workflow runs separately; the deploy workflow will run when code
reaches `main` unless branch protection is configured.

## Server setup still required

1. Create `/srv/apps/project-1/.env` with unique secrets and a real Tailscale
   auth key; set its mode to `0600`.
2. Configure `/srv/apps/project-1/ts-config/serve.json` with Tailscale Serve
   proxying HTTPS to `http://127.0.0.1:3000`.
3. Ensure external Docker network `ai-net` exists.
4. Ensure the runner runs as `mq` and the server checkout can `git pull --ff-only
origin main` without interaction.
5. Back up production data before the first migrations and confirm disk/RAM
   capacity for building the Node and AI images on the server.
6. After deploy, verify container health, HTTPS player/admin URLs, API routes,
   Socket.IO/WebSocket behavior, and a read-only login flow from an authorized
   tailnet device.

If the older `infra/docker/docker-compose.yml` stack has production database
data, migrate it intentionally: the new `project-1` Compose project uses its
own named volumes and will start with a separate database by default.

No production host was accessed and no production deployment was started.
