# Báo cáo rà soát mức cao nhất: ổn định kết nối EFLS

Ngày: 2026-11-20
Phạm vi: API gateway, game-core, realtime, worker, HTTP client web/admin, Socket.IO client/server, nginx/Tailscale/Docker, cấu hình tài nguyên.
Phương pháp: đọc mã nguồn + cấu hình triển khai (audit tĩnh). Không chạy e2e do môi trường local thiếu DB/Redis/AI.

---

## 1. Kết luận điều hành

"Mất kết nối server" hiện tại **không chủ yếu do đường truyền người chơi**. Có ít nhất 4 lỗi tất định ở phía hệ thống, mỗi lỗi đủ để gây rớt hàng loạt:

1. **Toàn bộ người chơi dùng chung một "xô" rate limit** (thiếu `trust proxy`) → 300 req/phút cho tất cả, 30 req/phút cho toàn bộ auth/refresh → 429 hàng loạt và bị đăng xuất oan.
2. **Tiến trình realtime có thể chết hoặc không khởi động được khi Redis chập chờn** (không có handler lỗi ioredis, `await ping()` trước khi listen) → mọi socket rớt cùng lúc, reconnect thất bại.
3. **Socket admin chết vĩnh viễn sau 10 lần thử**, chỉ dùng WebSocket, không timeout.
4. **Client coi lỗi mạng/5xx là "hết phiên"** → xóa session/redirect dù phiên còn hợp lệ; đồng thời không có timeout nên request có thể treo vô hạn.

Năm lỗi cấp cao tiếp theo: token socket bị "đóng băng" sau refresh; gateway→core không có proxy timeout; worker tick giữ transaction + `FOR UPDATE` quá lâu; nginx cấu hình WebSocket/polling chưa chuẩn; không có UX trạng thái kết nối toàn cục.

---

## 2. Bảng xếp hạng nguyên nhân

| # | Mức | Vấn đề | Bằng chứng | Triệu chứng người chơi thấy |
|---|-----|--------|-----------|------------------------------|
| 1 | CRITICAL | Rate limit toàn cục do thiếu `trust proxy` | `services/api-gateway/src/app.ts:42-49`; `routes/api.ts:11-17`; không có `app.set('trust proxy', ...)` trong toàn repo | Đang chơi bình thường → hàng loạt request 429, refresh 429 → bị đăng xuất / "mất kết nối" |
| 2 | CRITICAL | Realtime crash/không boot khi Redis lỗi | `services/realtime/src/main.ts:7-12` (`await attachRedis` trước `listen`); `redis.ts:8-15` không có `.on('error')`; không có `unhandledRejection` | Tất cả chat/presence rớt đồng thời, reconnect thất bại tới khi container restart |
| 3 | CRITICAL | Admin socket chết sau 10 lần thử | `apps/admin/src/shared/realtime/socket.ts` (`transports:['websocket']`, `reconnectionAttempts:10`) | Admin mất realtime/chat vĩnh viễn, phải F5 |
| 4 | HIGH | Logout oan khi mạng/5xx | `apps/web-game/src/shared/api/httpClient.ts:41-46,56-58,103-109`; `apps/admin/src/shared/api/httpClient.ts:37-39,48-50,72-77` | Mạng chập chờn vài giây → bị đá về login |
| 5 | HIGH | Socket giữ token cũ sau refresh | 2 file `realtime/socket.ts` dùng `auth:{token}` tĩnh; server auth ở handshake (`services/realtime/src/auth.ts`) | Hết 15 phút token → socket reconnect bị `unauthorized` lặp vô hạn |
| 6 | HIGH | Gateway→core không timeout, không graceful shutdown | `services/api-gateway/src/routes/proxy.ts` (không `proxyTimeout`); `main.ts` chỉ `app.listen` | Core chậm → request treo → nginx 504 → "mất kết nối" |
| 7 | HIGH | Worker tick 1 transaction lớn + nhiều `FOR UPDATE` | `services/worker/src/processors/gameTick.ts:325-351`; nhiều `FOR UPDATE` (dòng ~73-155, 507, 533, 692, 878) | Tick chạy → API chậm/timeout, lock wait tăng |
| 8 | MEDIUM | Nginx chưa chuẩn cho Socket.IO polling | `infra/deploy/nginx-project1.conf:32-42` hardcode `Connection "upgrade"`, không `proxy_buffering off`, không timeout API | Fallback polling lỗi, WS bị treo/ngắt bất thường |
| 9 | MEDIUM | Không có UX trạng thái kết nối | `apps/*/src/app/providers.tsx` chỉ `retry:1`; không `refetchOnReconnect`, không banner, không `navigator.onLine` | Người chơi không biết đang mất kết nối hay game lỗi |
| 10 | MEDIUM | Rủi ro OOM/restart ở host RAM thấp | Compose không đặt `mem_limit`; `ecosystem.config.cjs` cap 180M/300M/220M | Container bị kill → rớt hàng loạt, lặp lại |
| 11 | LOW | Refresh token stateless, không thu hồi | `services/game-core/src/modules/auth/auth.service.ts:162-169` | Đổi mật khẩu không vô hiệu hóa phiên cũ (bảo mật) |
| 12 | LOW | Health check bị tính vào rate limit | Global limiter đặt trước `/health` | Health check 10s/lần chiếm quota không cần thiết |

---

## 3. Phân tích chi tiết từng nguyên nhân

### 3.1. Rate limit dùng chung — nguyên nhân số 1

`express-rate-limit` mặc định lấy `req.ip`. Không có `trust proxy`, Express coi peer socket là IP client. Trong topology thực tế:

```
Trình duyệt → Tailscale Funnel/Serve → nginx (web-app) → api-gateway
```

Với gateway, peer duy nhất là nginx (cùng pod `network_mode: service:tailscale`, thực tế 127.0.0.1). Vì vậy `req.ip` **giống nhau cho mọi người chơi**.

Hệ quả định lượng:
- `/api`: 300 request/phút **cho toàn bộ người chơi**. Chỉ cần ~10 người chơi mở các trang có `refetchInterval: 30s` (`CharacterWellnessPage`, `CityPage`, `RealEstatePage`, `StockMarketPage` ×3) là vượt ngưỡng.
- `/api/v1/auth`: 30 request/phút **cho toàn bộ hệ thống**, bao gồm cả `/refresh`. Access token sống 15 phút; các phiên thường hết hạn lệch nhau nhưng vẫn dồn cục. Khi refresh trả 429:
  - Web: `response.ok === false` → `clearSession()` → **đăng xuất**.
  - Admin: `clearAdminSession()` + redirect login.
- Đây là lời giải thích khớp nhất với triệu chứng "đang chơi thì mất kết nối/đăng xuất".

Lưu ý: `express-rate-limit` v7 còn có thể log cảnh báo `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` khi thấy `X-Forwarded-For` nhưng `trust proxy` tắt; tùy cấu hình có thể làm rối log/500.

### 3.2. Realtime chết theo Redis

- `main.ts` dùng **top-level await** `await attachRedis(io)` **trước** `httpServer.listen`. Nếu `ping()` reject (Redis restart, DNS Docker chưa sẵn sàng, timeout), toàn bộ process throw và thoát → container restart loop → mọi socket rớt.
- Ba client ioredis (`pubClient`, `subClient`, `eventSubscriber`) **không có listener `'error'`**. ioredis phát `'error'` khi mất kết nối; EventEmitter không có listener sẽ ném lỗi → **crash process**. Một blip Redis = realtime chết = toàn bộ chat/presence mất.
- `void socket.join(...)` không có `.catch` → nếu adapter reject (Redis lỗi), unhandled rejection; Node 24 mặc định coi unhandled rejection là lỗi nghiêm trọng.
- Không có `process.on('unhandledRejection'|'uncaughtException')` ở realtime, game-core hay gateway → bất kỳ promise lỗi nào cũng có thể kill process.

### 3.3. Socket admin

`transports:['websocket']` + `reconnectionAttempts: 10` + không `reconnectionDelay/Max`, không `timeout`. Sau 10 lần (mặc định ~1s) là **dừng hẳn**. Không có nút "kết nối lại". Đây là lý do admin thường phải F5.

### 3.4. Đăng xuất oan

Web `refreshAccessToken` bắt mọi exception → `null`; sau đó `apiRequest` thấy còn 401 và `latest === token` → `clearSession()`. Admin thì tệ hơn: bất kỳ `!response.ok` (kể cả 429/500/502/503/504) đều `clearAdminSession()` + redirect.

Đồng thời `fetch` không có `AbortController`: khi upstream treo, request treo tới khi trình duyệt/nginx cắt; UI quay vô hạn.

### 3.5. Token socket bị đóng băng

Socket.IO client chỉ đọc token khi tạo socket hoặc khi gọi `getGameSocket()` và phát hiện khác token. Auto-reconnect dùng `socket.auth` hiện tại. Sau khi HTTP refresh thành công, nếu socket đang trong chu kỳ reconnect, nó gửi token cũ → server `authenticateSocket` từ chối → lặp lại. Kết quả: "chat mất kết nối" dù web vẫn tải được dữ liệu.

### 3.6. Gateway/core thiếu timeout & shutdown

`coreProxy` không đặt `proxyTimeout`/`timeout`. Nếu game-core bị block (tick, lock DB, GC), request treo tới khi nginx cắt (mặc định 60s) → 504. Gateway cũng không có graceful shutdown/`server.close`, nên khi deploy/restart, request đang bay bị cắt.

### 3.7. Worker tick

`processGameTick` mở `BEGIN` và giữ transaction qua toàn bộ tick (ngày game, lương, thuế, AI staff, ...), với nhiều `SELECT ... FOR UPDATE` trên `characters`, `companies`, `ledger_accounts`. Mọi thao tác người chơi đụng cùng row sẽ **chờ lock**; nếu tick dài (AI call, nhiều công ty), API latency tăng vọt → timeout phía client. Không có `statement_timeout`/`lock_timeout`, không có advisory lock chống chạy chồng.

### 3.8. Nginx

- `/socket.io/` hardcode `Connection "upgrade"` cho **mọi** request, kể cả long-polling. Chuẩn là `map $http_upgrade $connection_upgrade`.
- Không `proxy_buffering off` → polling bị đệm.
- `/api/` không có `proxy_read_timeout`/`proxy_connect_timeout`; upstream dùng biến `$api_upstream` nên **không dùng được upstream keepalive** (mỗi request mở connection mới).
- `resolver 127.0.0.11 valid=10s`: DNS Docker đổi IP container (recreate) có thể gây 502 trong cửa sổ cache.

### 3.9. UX & tài nguyên

- Không có banner "Đang kết nối lại…", không `refetchOnReconnect`, `retry: 1`, không phản ứng `online/offline`.
- Compose không đặt `mem_limit`/`mem_reservation`; host RAM thấp + Postgres/Redis/AI/4 Node service dễ OOM. PM2 (nếu dùng) cap thấp (gateway 180M) có thể restart liên tục dưới tải.

---

## 4. Phương án tối ưu (theo thứ tự triển khai)

### P0 — Trong ngày, sửa 4 nguyên nhân gốc (không đổi schema)

#### P0.1. Gateway: `trust proxy` + rate limit theo người dùng

```ts
// services/api-gateway/src/app.ts
app.set('trust proxy', 2); // Tailscale Serve (1) + nginx (1)
```

Thiết kế limiter:
- Key = `actor.id` nếu đã xác thực, ngược lại = `req.ip`.
- `/api` toàn cục: 900–1200 req/phút/key (đo thực tế rồi chỉnh), `skip` cho `/health` và request nội bộ.
- Auth: 60 req/phút/IP, `skipSuccessfulRequests: true`; **riêng `/refresh` dùng bucket rộng hơn** (ví dụ 120/phút/IP) để không chặn refresh hợp lệ.
- Trả 429 kèm `Retry-After` + JSON ProblemDetails.
- Ghi log `429` kèm path + key để xác minh sau triển khai.

Bắt buộc xác minh chuỗi XFF thực tế (log `req.ip` + `x-forwarded-for` một lần) trước khi chốt `2`.

#### P0.2. Realtime: không chết vì Redis

- Gắn `.on('error', ...)` cho cả 3 client ioredis; log + metric, không throw.
- `attachRedis` trả về trạng thái; **listen trước**, gắn adapter sau (retry backoff). Nếu Redis chết, realtime vẫn phục vụ health + socket cục bộ (degraded), tự gắn lại khi Redis trở lại.
- Bọc mọi `void socket.join(...)` bằng `.catch(...)`, hoặc `await` trong handler async có try/catch.
- Thêm `process.on('unhandledRejection'|'uncaughtException')` cho realtime/gateway/core: log đầy đủ, đóng server có kiểm soát, exit(1) để orchestrator restart.
- Thêm `pool.on('error')` cho pool realtime.

#### P0.3. Socket client web + admin

Dùng auth động và reconnect vô hạn:

```ts
socket = io(url, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5,
  timeout: 20000,
  auth: (cb) => cb({ token: currentToken() }),
});
```

- Bỏ hẳn `transports:['websocket']` và `reconnectionAttempts:10` ở admin.
- Sau login/refresh/logout: gọi `reconnectGameSocket()`/`reconnectAdminSocket()` để áp token mới ngay.
- Lắng nghe `connect_error`: nếu `message === 'unauthorized'` → thử refresh HTTP rồi reconnect, không spam vô hạn với token cũ.

#### P0.4. HTTP client: timeout + phân loại lỗi + không logout oan

- `AbortController` timeout: GET 15s, mutation 30s (cấu hình được).
- Chỉ `clearSession`/redirect khi refresh trả **401/403 rõ ràng** (hoặc token không tồn tại). Với `TypeError`/abort/5xx/429: giữ phiên, ném `ApiError` có `status = 0` và `problem.kind='network'`.
- Retry GET một lần với backoff + jitter cho network/502/503/504; mutation chỉ retry khi có `Idempotency-Key`.
- Admin: thêm `refreshPromise` dedupe (như web) để tránh nhiều refresh đồng thời.
- Khi refresh bị 429: **không** logout, chờ `Retry-After`.

#### P0.5. Gateway/core timeout + graceful shutdown

- Proxy: `proxyTimeout: 30_000`, `timeout: 30_000`.
- Gateway `http.Server`: `headersTimeout = 20s`, `requestTimeout = 30s`, `keepAliveTimeout = 65s`.
- `SIGTERM`: ngừng nhận request mới, chờ in-flight tối đa 10–15s rồi exit (giống game-core hiện có).
- game-core: đặt `statement_timeout` mặc định cho pool (ví dụ 15s) và `idle_in_transaction_session_timeout`.

### P1 — Trong 1–2 ngày

1. **Nginx**: `map $http_upgrade $connection_upgrade`; `proxy_buffering off` cho `/socket.io/`; `proxy_read_timeout 120s`; `proxy_connect_timeout 5s`; API thêm `proxy_read_timeout 60s` + `proxy_set_header Connection ""`; chuyển upstream tĩnh để bật `keepalive 32` (hoặc dùng `resolver` + `zone`).
2. **UX kết nối toàn cục**:
   - `ConnectionStatusProvider`: theo dõi socket (`connecting/reconnecting/disconnected`) + `navigator.onLine`.
   - Banner cố định: "Đang kết nối lại…" / "Mất kết nối máy chủ – Thử lại".
   - `QueryClient`: `refetchOnReconnect: true`, `retry` có điều kiện (chỉ lỗi mạng/5xx), `networkMode: 'online'`.
   - Khi socket `connect` lại: invalidate các query trọng yếu (nhân vật, tiền, thông báo, chat).
3. **Worker tick**:
   - `SET LOCAL lock_timeout='5s'`, `statement_timeout='30s'` trong transaction.
   - Advisory lock (`pg_try_advisory_lock`) chống tick chồng.
   - Tách transaction: (a) tiến thời gian + sự kiện, (b) lương/thuế, (c) AI/best-effort; mỗi phần commit riêng.
   - Đo thời lượng tick, cảnh báo nếu > 10s.
4. **Giám sát**: đếm 429/5xx/504, thời lượng tick, pool waiting, event-loop lag, restart count; dashboard + alert.

### P2 — Củng cố

1. Giới hạn tài nguyên container + swap; rà `max_memory_restart` PM2 theo RSS thực tế.
2. Refresh token rotation + thu hồi (bảng `refresh_tokens`) để vừa bảo mật vừa phát hiện phiên chết chính xác.
3. Tách realtime scale ngang (đã có Redis adapter) và healthcheck sâu (Redis/DB) cho readiness.
4. Kiểm thử tải định kỳ (k6): 50–100 VU, xác nhận không còn 429 dùng chung.

---

## 5. Tiêu chí nghiệm thu

| Kịch bản | Kỳ vọng |
|----------|---------|
| 30 người chơi đồng thời, mỗi người 1 req/2s | Không có 429 (trừ khi vượt quota/người) |
| Hết hạn access token khi đang mở 5 tab | Refresh thành công, không logout; socket vẫn kết nối |
| `docker restart redis` | Realtime không chết; client thấy "đang kết nối lại"; tự hồi phục < 15s |
| `docker restart game-core` | Client thấy banner, request fail có thông báo; tự phục hồi khi core lên |
| Rút mạng client 10s | Không logout; tự reconnect + refetch |
| Tick chạy trong lúc thao tác | p95 API < 1s; không 504 |
| F5 trang admin 20 lần | Socket luôn kết nối lại được, không cần F5 lần 2 |

---

## 6. Ghi chú triển khai

- Thứ tự an toàn: P0.1 → P0.4 → P0.3 → P0.2 → P0.5, rebuild/restart `api-gateway`, `realtime`, rồi web/admin.
- Sau khi sửa rate limit, **bắt buộc** log/kiểm tra `req.ip` thực tế một lần; nếu Tailscale chèn thêm hop, chỉnh `trust proxy` thành 3.
- Các thay đổi không đụng schema, không ảnh hưởng dữ liệu game; có thể rollback từng service độc lập.
- Việc áp migration `0090_company_groups_buyouts_mergers.sql` vẫn đang chờ, độc lập với gói ổn định kết nối này.
