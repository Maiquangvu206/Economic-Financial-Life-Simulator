# EFLS Production Deploy (Low-RAM Ubuntu Host)

Target example: **Ubuntu 26.04.1 LTS**, Intel Pentium N3710 (4 cores), **3.22 GiB RAM**, SSD ~98 GB, Nginx, PM2, Tailscale, Cloudflare Tunnel.  
Goal: run EFLS (Player + API + Realtime/Socket.IO chat + Admin) stably with **no Docker containers**, static frontend builds, and **Admin accessible only via Tailscale**.

## 1) Architecture & constraints
- **Public (Cloudflare Tunnel → Nginx):** Player web (`apps/web-game/dist`), public API, Socket.IO (`/socket.io`) for realtime/chat.
- **Private (Tailscale only):** Admin web (`apps/admin/dist`) and admin endpoints (restrict by `100.64.0.0/10` + firewall; do not publish via tunnel).
- **RAM budget (~1.7 GiB free):** prefer native services and few processes:
  - Nginx serves static `dist/` (do **not** run `vite preview`)
  - PostgreSQL + Redis native (systemd), tuned low-memory
  - PM2 runs **1 instance** each: `api-gateway`, `game-core`, `realtime` (enable `worker` only if needed)
- **Chat reliability:** **PostgreSQL is the source of truth** for chat messages/read state; Realtime pushes events and returns ACKs. Missing DB/Redis/migrations or unstable connectivity will break chat sync.

## 2) Prerequisites (Ubuntu, native)
Install (examples): Node.js LTS + pnpm, Nginx, PM2, PostgreSQL, Redis, build tools as needed.
```bash
# Node/PM2 (example)
npm i -g pm2
pnpm -v

# Services (package names may vary by distro release)
sudo apt update
sudo apt install -y nginx postgresql redis-server
```

## 3) PostgreSQL (chat + game DB)
1. Create DB/user and set a strong password.
2. Apply low-RAM tuning (see `postgres-lowram.conf.example`) via `conf.d` include and restart PostgreSQL.
3. Run all migrations in `infra/db/migrations/` **in order**, including **`0064_chat_messages.sql`** (required for chat persistence).
4. Keep `max_connections` modest (e.g. 30–50) and ensure apps use reasonable pool sizes.
5. Enable backups (cron `pg_dump`) and monitor disk usage (chat growth).

Suggested tuning highlights for ~3 GB RAM: `shared_buffers=128MB`, `effective_cache_size=512MB`, `work_mem=4MB`, `max_connections=40`.

## 4) Redis
- Required by `realtime` (per service env). Apply `redis-lowram.conf.example` (e.g. `maxmemory 96mb`, bind localhost) and restart.
- Monitor evictions/memory; adjust policy based on realtime usage.

## 5) App build & environment
From repo root on the server:
```bash
pnpm install --frozen-lockfile
# Set VITE_* (API/Realtime/Portal/Admin URLs) for production, then build
pnpm -r build
```
- Frontend `VITE_*` values are baked at build time; **rebuild dist** when URLs/origins change.
- Copy and edit env: `infra/deploy/.env.production.example` → `.env.production` (or export vars). Set strong secrets and correct origins/ports/DB/Redis URLs.

## 6) PM2 (Node services)
- Use `ecosystem.config.cjs` (1 instance per service, `max_memory_restart` limits).
- Start with production env and persist:
```bash
# Ensure env vars are loaded for Node processes (export or use your env loader), then:
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup  # follow printed instructions
```
- Run **only required** services on low RAM: `efls-api-gateway`, `efls-game-core`, `efls-realtime` (add worker only if necessary).
- Logs/health: `pm2 ls`, `pm2 logs`, `pm2 monit`.

## 7) Nginx + Cloudflare Tunnel + Tailscale
- **Public:** use `nginx-efls-public.conf` as a template. Serve `web-game/dist`, proxy `/api` and `/socket.io` (WebSocket upgrade) to local upstreams. Expose this vhost via **Cloudflare Tunnel** only.
- **Admin (private):** use `nginx-efls-admin-tailscale.conf`. Serve `admin/dist`, **allow only `100.64.0.0/10` and deny all**, do **not** route through Cloudflare Tunnel. Optionally bind/firewall admin to Tailscale interface only.
- Enable gzip, static asset caching, and verify SPA fallback (`try_files ... /index.html`).

## 8) Chat: stability checklist
- [ ] PostgreSQL reachable; `0064_chat_messages.sql` applied
- [ ] Redis reachable; `realtime` has valid `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`
- [ ] `VITE_REALTIME_URL` same for web-game and admin (rebuilt)
- [ ] CORS/origins (`WEB_ORIGIN`, `ADMIN_ORIGIN`) correct
- [ ] Realtime logs show no `[realtime] chat:* failed`; clients receive ACK (no stuck “Đang gửi”)
- [ ] Plan retention to control growth (see `scripts/chat-retention.sql` / `scripts/chat-retention.mjs`)

## 9) Chat retention (DB hygiene)
- SQL: `psql "$DATABASE_URL" -v days=30 -f scripts/chat-retention.sql`
- Node: `CHAT_RETENTION_DAYS=30 node scripts/chat-retention.mjs` (or pass days arg)
Schedule via cron during low-traffic windows; adjust retention to policy/disk.

## 10) Backups & operations
- **DB backups:** nightly `pg_dump` + off-host copy; test restores.
- **Monitoring:** RAM/swap, CPU, Postgres connections, Redis memory, PM2 restarts, Nginx/Tunnel/Tailscale status.
- **Security:** strong secrets, rotate tokens/passwords, keep admin off public internet, least-privilege DB user, timely OS/package updates.

## 11) Files in this folder
- `.env.production.example` — production env template
- `nginx-efls-public.conf` — public Nginx template (Cloudflare Tunnel)
- `nginx-efls-admin-tailscale.conf` — admin-only Nginx template (Tailscale)
- `postgres-lowram.conf.example` — PostgreSQL low-RAM tuning hints
- `redis-lowram.conf.example` — Redis low-RAM tuning hints
- `README.md` — this guide
