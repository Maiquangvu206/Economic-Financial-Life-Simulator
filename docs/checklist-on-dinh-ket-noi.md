# Checklist triển khai & nghiệm thu — Ổn định kết nối EFLS

> Ngày lập: 2026-11-20 · Cập nhật triển khai: 2026-11-20
> Phạm vi: phương án P0/P1/P2 trong `docs/bao-cao-on-dinh-ket-noi-va-phuong-an-toi-uu-2026-11-20.md`
> Quy ước: `[x]` đã hoàn tất · `[ ]` chưa làm / cần xác minh thêm · `[~]` hoàn tất một phần (có ghi chú)

---

## 0. Tổng quan trạng thái

| Hạng mục | Trạng thái | Ghi chú |
| --- | --- | --- |
| P0 — 4 nguyên nhân gốc | ✅ Code + deploy | Gateway, realtime, socket client, HTTP client |
| P1 — Timeout, worker, nginx, UX | ✅ Code + deploy | Advisory lock, nginx WS/API, banner, React Query retry |
| P2 — Tài nguyên & cấu hình | 🟡 Một phần | Heap cap + restart backoff; rotation token / k6 / hard mem limit deferred |
| Migrations DB | ✅ Đã áp dụng | 0089, 0090, 0091 ghi nhận trong `schema_migrations` |
| Build & typecheck | ✅ Pass | 6 package typecheck; 4 service build; 2 app build/dist |
| Triển khai container | ✅ Đã triển khai | `api-gateway`, `realtime`, `worker`, `game-core`, `ai` rebuild/restart; `web-app` hot-deploy dist + nginx conf + reload |
| Nghiệm thu runtime đầy đủ | 🟡 Một phần | Health/log cơ bản OK; thiếu load test 30 user, token-expiry soak, restart Redis có chủ đích, đo p95 dài |
| Hạ tầng ngoài mã nguồn | ⚠️ Có cảnh báo | `efls-tailscale-1` đang restart loop (auth/TS_AUTHKEY) — không do thay đổi mã nguồn lần này |

---

## 1. Kết quả triển khai (2026-11-20)

### 1.1 Database / migrations

- [x] Áp dụng migrations còn thiếu qua migrate runner: `0089_characters_last_active_at.sql`, `0090_company_groups_buyouts_mergers.sql`, `0091_stamina_monthly_activity.sql`.
- [x] Xác minh `schema_migrations` chứa đủ 0089–0091.
- [x] Xác minh bảng M&A đã tồn tại: `company_groups`, `company_group_members`, `company_buyout_offers`, `company_buyout_purchases`, `company_mergers`.
- [ ] Chạy SQL dọn dữ liệu thuế cá nhân sai năm (nếu còn dữ liệu lịch sử sai) — **chưa rà soát dữ liệu production cụ thể**.

### 1.2 Dịch vụ backend (Docker)

- [x] Rebuild image mới: `efls-api-gateway`, `efls-realtime`, `efls-worker`, `efls-game-core` (bao gồm thay đổi env/heap/logic).
- [x] Khởi động lại: `api-gateway`, `realtime`, `worker`, `game-core`; khôi phục `ai` container.
- [x] Healthchecks OK:
  - `api-gateway` → `{"status":"ok","service":"api-gateway"}`
  - `realtime` → `{"status":"ok","service":"realtime"}`
  - `game-core` → `{"status":"ok","service":"game-core","env":"production"}`
  - `worker` → `{"status":"ok","service":"worker"}`
- [x] Realtime log xác nhận: listen + Redis client ready + `Redis adapter and subscriber ready` (channel `efls:realtime`).
- [x] Worker log xác nhận: jobs scheduled, `Game tick committed` (tick 1, `appliedCount=7`, `durationMs=126`).

### 1.3 Web/Admin frontend + nginx

- [x] Build cục bộ mới: `apps/web-game/dist`, `apps/admin/dist` (Vite build thành công).
- [x] Hot-deploy vào container đang chạy `efls-web-app-1`:
  - copy `apps/web-game/dist/*` → `/usr/share/nginx/html/`
  - copy `apps/admin/dist/*` → `/usr/share/nginx/html/admin/`
  - copy `infra/deploy/nginx-project1.conf` → `/etc/nginx/conf.d/default.conf`
- [x] `nginx -t` thành công trong container, `nginx -s reload` thành công.
- [ ] Rebuild image `efls-web-app` để thay đổi bền vững khi recreate container — **khuyến nghị chạy** `docker compose build web-app` (chưa thực hiện do thời gian build dài; runtime hiện tại đã có bản mới).

### 1.4 Trạng thái hạ tầng quan sát được

- [x] `efls-postgres-1`, `efls-redis-1`, `efls-ai-1`, `efls-game-core-1`, `efls-api-gateway-1`, `efls-realtime-1`, `efls-worker-1`, `efls-web-app-1` đang Up/healthy.
- [~] `efls-tailscale-1` **Restarting (1)** — cần kiểm tra `TS_AUTHKEY`/serve config; ảnh hưởng truy cập public qua Tailscale Funnel/Serve nhưng không phải hồi quy từ patch ổn định kết nối.

---

## 2. P0 — Sửa nguyên nhân gốc (không đổi schema)

### P0.1 Gateway: `trust proxy` + rate limit theo IP thật

- [x] `services/api-gateway/src/config/env.ts`: `TRUST_PROXY_HOPS` (mặc định 2), `RATE_LIMIT_PER_MIN` (900), `AUTH_RATE_LIMIT_PER_MIN` (60), `REFRESH_RATE_LIMIT_PER_MIN` (120), `PROXY_TIMEOUT_MS` (30000).
- [x] `services/api-gateway/src/app.ts`: `app.set('trust proxy', env.TRUST_PROXY_HOPS)` trước middleware; rate limit toàn cục bỏ qua `/health` & `/healthz`; handler 429 ProblemDetails.
- [x] `services/api-gateway/src/middleware/rateLimit.ts`: phản hồi 429 tiếng Việt, helper `isHealthPath`.
- [x] `services/api-gateway/src/routes/api.ts`: auth limiter `skipSuccessfulRequests`, bỏ qua `/refresh`; bucket riêng `/api/v1/auth/refresh`.
- [x] Bỏ `keyGenerator` thủ công dùng `req.ip` sai ngữ cảnh.

**Cần xác minh trên môi trường thật**

- [ ] Xác nhận số hop thực tế (`Tailscale Serve` + `nginx` = 2; nếu có lớp proxy khác thì +1) bằng log `req.ip`/`X-Forwarded-For`.
- [ ] 30 phiên đồng thời trong 60s: không còn 429 dùng chung.

### P0.2 Realtime: không chết vì Redis

- [x] `services/realtime/src/redis.ts`: best-effort attach, retry 5s, listener `error`/`ready`/`end` cho pub/sub/events, subscribe kênh an toàn.
- [x] `services/realtime/src/main.ts`: listen trước `startRedis()`; process guards; shutdown sạch.
- [x] `services/realtime/src/db.ts`: `pool.on('error')`.
- [x] `services/realtime/src/server.ts`: `safeJoin`/`safeLeave`, `headersTimeout`/`keepAliveTimeout`.

**Cần xác minh trên môi trường thật**

- [ ] `docker restart efls-redis` (có chủ đích): realtime không restart, socket client tự phục hồi.

### P0.3 Socket client web + admin

- [x] `apps/web-game/src/shared/realtime/socket.ts`: auth callback động, `reconnectionAttempts: Infinity`, websocket+polling, backoff+jitter, timeout 20s, đóng socket khi logout.
- [x] `apps/admin/src/shared/realtime/socket.ts`: parity (trước đây websocket-only + 10 lần thử).
- [x] `apps/admin/src/features/auth/session.ts`: `subscribeAdminSession`.
- [x] `ConnectionStatusBanner` (web/admin): offline/reconnecting/failed/synced, nút retry, refresh query sau reconnect, kích hoạt refresh token khi `connect_error` unauthorized.

**Cần xác minh**

- [ ] Token hết hạn 15 phút trong lúc socket reconnect → không bị từ chối vĩnh viễn.
- [ ] Mất mạng 10s → tự reconnect + đồng bộ dữ liệu.

### P0.4 HTTP client: timeout + phân loại lỗi + không logout oan

- [x] Web `httpClient.ts`: timeout 15s/30s, `ApiError.kind` (`http`/`network`/`timeout`), retry GET 1 lần, retry 502/503/504 idempotent, refresh outcome `ok/invalid/transient`, không logout khi transient, xử lý 304/204, thông điệp 429.
- [x] Admin `httpClient.ts`: parity + dedupe refresh, chỉ redirect khi refresh `invalid`.

**Cần xác minh**

- [ ] Mất mạng/502-504 tạm thời không đăng xuất; refresh token hết hạn thật sự mới đăng xuất.

### P0.5 Gateway/core timeout + graceful shutdown

- [x] `services/api-gateway/src/routes/proxy.ts`: `proxyTimeout`/`timeout`, 504 vs 502 JSON.
- [x] `services/api-gateway/src/main.ts`, `services/game-core/src/main.ts`: HTTP timeouts + process guards + graceful shutdown.
- [x] `services/game-core/src/shared/db/pool.ts`: `statement_timeout`/`query_timeout`/`idle_in_transaction_session_timeout` = 30s.

---

## 3. P1 — Ổn định vận hành

### P1.1 React Query

- [x] Web/Admin `providers.tsx`: `retryTransient`, `refetchOnReconnect: true`, `networkMode: 'online'`, mutation `retry: 0`.

### P1.2 Worker

- [x] `services/worker/src/processors/gameTick.ts`: advisory xact lock `774311001`, skip an toàn khi chồng tick, `lock_timeout`/`statement_timeout`, log `durationMs`.
- [x] `services/worker/src/config/env.ts`: `GAME_TICK_LOCK_TIMEOUT_MS`, `GAME_TICK_STATEMENT_TIMEOUT_MS`.
- [x] `services/worker/src/main.ts`, `queues.ts`, `publisher.ts`: bootstrap retry, Redis retryStrategy + error handlers, shutdown an toàn.
- [~] Đã quan sát 1 tick thành công (`126ms`); **chưa đo p95** trên tải thực và chưa tái hiện tick chồng.

### P1.3 Nginx

- [x] Cập nhật repo: `infra/deploy/nginx-project1.conf`, `infra/deploy/nginx-efls-public.conf`, `infra/deploy/nginx-efls-admin-tailscale.conf`, `infra/nginx/efls.conf` (upgrade map, timeout/socket/API, buffering, keepalive).
- [x] Nginx trong `efls-web-app-1` dùng `nginx-project1.conf` đã được thay và reload thành công.
- [ ] Kiểm tra thực tế WS 101 và long-polling fallback qua trình duyệt/proxy công khai.

### P1.4 UX

- [x] Banner trạng thái kết nối hiển thị trong web/admin layout.
- [ ] Kiểm tra trực quan desktop/mobile trên đường truy cập thật.

---

## 4. P2 — Củng cố & deferred

### Đã làm

- [x] `docker-compose.yml`: `NODE_OPTIONS` heap cap (gateway 192, game-core 384, realtime 256, worker 320) + env gateway/worker timeout & rate limit.
- [x] `ecosystem.config.cjs`: tăng `max_memory_restart` (320/480/360), `exp_backoff_restart_delay`, `min_uptime`, `max_restarts`, `kill_timeout`.

### Deferred (chưa làm, có lý do)

- [ ] **Refresh token rotation + revocation** — cần migration/schema mới và kiểm thử đăng nhập đa thiết bị; chưa thực hiện.
- [ ] **k6/vegeta load test trong CI hoặc staging** — cần kịch bản và dữ liệu/môi trường phù hợp.
- [ ] **Container hard memory limits (`deploy.resources`)** — cần đo RSS thực tế trên host 3–4GB trước khi chốt.
- [ ] **Tách `processGameTick` thành nhiều transaction theo pha** — đã giảm rủi ro treo bằng advisory lock + timeout; refactor lớn, defer.

---

## 5. Bổ sung sửa lỗi liên quan (đã triển khai)

- [x] `services/game-core/src/modules/corporations/corporation.service.ts`: `ipoCompany` trả về danh sách cổ đông thật (`toShareholderDtos`) thay vì `shareholders: []`.
- [x] `services/game-core/src/modules/corporations/corporation.repository.ts`: `listShareholders(companyId, db?)` hỗ trợ truyền client/transaction.
- [x] `apps/web-game/src/features/business/BusinessPageView.tsx`: sửa typecheck (`IndustryType`, annotate `filing`).

---

## 6. Lệnh đã chạy & kết quả

```bash
# Migrations
docker compose --env-file .env run --rm migrate
# => applied 0089, 0090, 0091 (3 new migration(s))

# Typecheck
pnpm --filter @efls/api-gateway --filter @efls/realtime typecheck          # OK
pnpm --filter @efls/worker --filter @efls/game-core typecheck              # OK
pnpm --filter @efls/web-game typecheck                                     # OK
pnpm --filter @efls/admin typecheck                                        # OK

# Build
pnpm --filter @efls/api-gateway --filter @efls/realtime \
     --filter @efls/worker --filter @efls/game-core build                  # OK
pnpm --filter @efls/web-game --filter @efls/admin build                    # OK

# Deploy backend
docker compose --env-file .env up -d --build api-gateway realtime worker game-core
# (+ phục hồi ai/api-gateway container do xung đột tạo container trung gian)

# Frontend hot-deploy
docker cp apps/web-game/dist/.  efls-web-app-1:/usr/share/nginx/html/
docker cp apps/admin/dist/.     efls-web-app-1:/usr/share/nginx/html/admin/
docker cp infra/deploy/nginx-project1.conf efls-web-app-1:/etc/nginx/conf.d/default.conf
docker exec efls-web-app-1 nginx -t && docker exec efls-web-app-1 nginx -s reload  # OK
```

---

## 7. Còn dở / cần làm tiếp

1. [ ] **Khắc phục `efls-tailscale-1` restart loop** (kiểm tra `TS_AUTHKEY`, `ts-config/serve.json`, quyền state) để public endpoint ổn định.
2. [ ] **Rebuild image `efls-web-app`** để hot-deploy hiện tại trở thành immutable deploy.
3. [ ] **Xác minh `TRUST_PROXY_HOPS`** bằng IP thật trong log khi có traffic qua Tailscale/nginx.
4. [ ] **Nghiệm thu P0**: token expiry 15m + socket reconnect, ngắt mạng 10s, `docker restart redis` (quan sát realtime không chết), core restart → 502/504 nhanh + banner phục hồi.
5. [ ] **Nghiệm thu tải**: ≥30 phiên đồng thời 60s, kiểm tra không 429 chung, không logout oan; thu thập `durationMs` tick để xác nhận p95 < 1s.
6. [ ] **Kiểm tra chức năng nghiệp vụ sau deploy**: chat/presence, thuế cá nhân, doanh thu theo kỳ, M&A (migration 0090), nhận nuôi, AI providers, admin overview.
7. [ ] **Rà soát/cleanup dữ liệu thuế cá nhân sai năm** (nếu có).
8. [ ] Triển khai các mục P2 deferred khi có điều kiện (refresh token rotation, k6, hard mem limit, tách pha tick).
