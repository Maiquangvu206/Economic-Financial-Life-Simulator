# Báo cáo kiểm tra dự án EFLS (Realtime • Liên kết • Trải nghiệm)

- **Ngày kiểm tra:** 2026-11-17
- **Phạm vi:** rà soát mã nguồn, cấu hình, luồng tích hợp và trải nghiệm (đọc tĩnh + đối chiếu cấu trúc triển khai). **Không thực hiện kiểm thử end-to-end trên môi trường chạy đầy đủ** do phụ thuộc hạ tầng (DB/Redis/dịch vụ) chưa sẵn sàng trong phiên hiện tại.
- **Phương pháp:** 5 lượt kiểm tra (Pass 1–5) theo kiến trúc, realtime/chat, API-DB-xác thực, frontend/UX, triển khai-vận hành.

## Kết luận nhanh

| Hạng mục | Đánh giá | Ghi chú |
|---|---|---|
| **Realtime (chat/presence)** | **Cải thiện đáng kể trong mã nguồn, chưa xác nhận “ổn định” thực tế** | Đã sửa luồng chat riêng (userId thống nhất, lịch sử, emit 2 chiều, ACK/dedupe, presence). Cần rebuild/restart + test E2E. |
| **Liên kết hệ thống (FE↔Gateway↔Core↔Realtime↔DB/Redis)** | **Thiết kế tách lớp rõ; mức ổn định phụ thuộc cấu hình & hạ tầng** | Gateway proxy `/api`→core, client kết nối realtime trực tiếp. Hiện có rủi ro do lệch/thiếu cấu hình và dịch vụ nền. |
| **Trải nghiệm người dùng** | **Khá (nền tảng tốt), chưa đạt “tốt” đồng đều** | Có loading/toast/optimistic/ACK-timeout; vẫn phụ thuộc trạng thái kết nối, chất lượng dữ liệu và một số giới hạn (test key, presence đơn node). |

**Trả lời câu hỏi:** *Dự án đã realtime, liên kết ổn định và trải nghiệm tốt chưa?*  
- **Realtime:** về **logic mã nguồn** đã hướng tới realtime tức thì và đồng bộ hơn (sau các bản sửa chat), nhưng **chưa thể khẳng định ổn định** cho đến khi chạy E2E trên môi trường đủ dịch vụ.  
- **Liên kết:** **có cấu trúc liên kết đúng hướng** (gateway, core, realtime, contracts), song **chưa thể coi là ổn định thực tế** khi DB/Redis/token/env/dịch vụ chưa được xác nhận đồng nhất.  
- **Trải nghiệm:** **tạm đạt mức trung bình-khá**; cần hoàn thiện/kiểm chứng thêm để gọi là “tốt” (đặc biệt chat đa phiên, lỗi mạng, trạng thái rỗng/lỗi thân thiện nhất quán).

---

## Pass 1 — Kiến trúc & luồng liên kết (Topology)

### Quan sát (bằng chứng mã nguồn/cấu hình)
- **Monorepo pnpm/turbo:** `apps/web-game`, `apps/admin`, `services/api-gateway`, `services/game-core`, `services/realtime`, `services/worker`, `ai`, `packages/contracts|domain|ui` (`README.md`, `package.json`, `pnpm-workspace.yaml`).
- **REST:** trình duyệt → `VITE_API_BASE_URL` (mặc định `http://localhost:3000`, gateway) → gateway proxy `/api` sang game-core (`services/api-gateway/src/routes/{api.ts,proxy.ts}`), gắn `x-internal-token`, `x-actor-id/role`, giữ body/path. Core mount router, gồm `chat` tại `/api/v1/chat` (`services/game-core/src/app.ts`).
- **Realtime:** client Socket.IO kết nối **trực tiếp** tới `VITE_REALTIME_URL` (mặc định `http://localhost:5000`) qua `apps/{web-game,admin}/src/shared/realtime/socket.ts` (websocket, auth token, reconnect). **Gateway không proxy Socket.IO** trong cấu hình hiện có.
- **Realtime service:** Socket.IO server, CORS theo `WEB_ORIGIN/ADMIN_ORIGIN`, xác thực JWT access (`services/realtime/src/{server.ts,auth.ts,identity.ts,config/env.ts}`), health `/health`.
- **Hạ tầng tham chiếu:** `infra/docker/docker-compose.yml` (postgres, redis, migrate, ai, game-core, api-gateway, realtime, worker; profile `app`), `infra/nginx/efls.conf` (proxy `/api/` → gateway, `/socket.io/` → realtime), `ecosystem.config.cjs` (PM2: gateway/core/realtime).

### Đánh giá
- **Tốt:** phân tách gateway (entry/auth/rate/proxy), core (nghiệp vụ), realtime (fan-out/presence/chat), contracts dùng chung.
- **Rủi ro liên kết:** phụ thuộc đúng `VITE_REALTIME_URL`, `WEB_ORIGIN/ADMIN_ORIGIN`, `JWT_ACCESS_SECRET` đồng nhất giữa gateway/core/realtime, và mạng cho phép kết nối trực tiếp tới realtime (hoặc qua nginx `/socket.io/` nếu triển khai theo đó — cần đồng nhất URL client).

---

## Pass 2 — Realtime & Chat (sau các bản sửa gần đây)

### Những gì đã triển khai/sửa trong mã nguồn
- **Định danh hội thoại:** dùng `userId` (bảng users) làm `id/peerUserId/partnerUserId`; lịch sử `GET /api/v1/chat/private/:partnerUserId` (`game-core chat module`).
- **Realtime private chat:** server nhận `receiverId|receiverUserId`, lưu `chat_messages`, emit `chat:private` (và legacy) tới **cả** room `user:${receiverId}` và `user:${senderId}` (+ room tương thích), ACK `ok/id/clientMsgId/createdAt`, rate-limit (`services/realtime/src/server.ts`).
- **Client:** optimistic send + timeout ACK, dedupe theo `id/clientMsgId`, tải lịch sử khi mở hội thoại, merge/cập nhật `lastMessage/lastAt/unread`, đẩy hội thoại lên đầu (`apps/{admin,web-game}/src/features/chat/useChatSocket.ts`).
- **Presence:** server đếm socket/user, broadcast `user:presence` + snapshot `presence:sync (__online_users__)`; client duy trì `onlineUserIds` và hiển thị **cùng biến `isOnline`** cho chấm + chữ trong UI chat.
- **Contracts:** bổ sung `user:presence`, hỗ trợ alias `receiverUserId` (`packages/contracts/src/realtime/events.ts`).

### Điểm mạnh
- Hướng tới realtime tức thì 2 chiều, chống trùng tin, có lịch sử bù đắp khi mở hội thoại.
- Join `user:${userId}` cố định và echo về sender giúp đồng bộ đa tab/thiết bị (khi cùng instance realtime).

### Rủi ro/Hạn chế còn lại
- **Chưa kiểm chứng E2E:** cần xác nhận trên hệ thống chạy thật (đăng nhập 2 vai trò, nhiều tab, reconnect, offline/online).
- **Presence in-memory theo tiến trình:** đúng với 1 instance realtime; **không chia sẻ** nếu scale nhiều instance (cần Redis/pubsub/adapter presence).
- **Phụ thuộc DB:** persist/lịch sử/conversations/read cần Postgres khả dụng; nếu DB lỗi, realtime vẫn có thể emit nhưng lưu/đọc lịch sử sẽ hỏng (server log cảnh báo persist).
- **Identity fallback:** khi DB lỗi lúc resolve actor, socket có thể dùng tên fallback — ảnh hưởng hiển thị, không ảnh hưởng khóa `userId` nếu token hợp lệ.
- **Test từng key AI/chat “Test” riêng:** chat có ACK; phần “Test” cấu hình AI không phải probe thực từng provider (ghi nhận ở module AI).

**Đánh giá Pass 2:** *Realtime chat “đúng hướng và khả thi” nhưng chưa thể kết luận ổn định nếu chưa chạy tích hợp đầy đủ.*

---

## Pass 3 — Liên kết API • Xác thực • Cơ sở dữ liệu

### Quan sát
- **Gateway:** xác thực access token cho route bảo vệ, kiểm tra role cho `/api/v1/admin`, forward actor headers nội bộ; core đọc context qua middleware `attachActor` (chat routes dùng `attachActor`).
- **Chat API:** `/search-users`, `/conversations`, `/private/:partnerUserId`, `/conversations/read` truy vấn `users/characters/chat_messages/chat_conversation_reads` (cần migration `0064_chat_messages.sql` và schema nhất quán).
- **Cấu hình hiện tại (.env mẫu trong repo/dev):** `DATABASE_URL` trỏ `localhost:5433` với user/pass; trong phiên kiểm tra trước đó ghi nhận **xác thực DB thất bại** nếu credentials không khớp → ảnh hưởng đăng nhập, chat history, AI config lưu DB, thống kê.
- **Redis:** cần cho realtime adapter/pubsub/worker tuỳ luồng (`REDIS_URL` có trong env; chưa xác nhận tiến trình chạy trong phiên này).

### Rủi ro
- Mất đồng bộ token/secret/origin (`JWT_ACCESS_SECRET`, `INTERNAL_SERVICE_TOKEN`, `WEB_ORIGIN/ADMIN_ORIGIN`, `VITE_*`) giữa các service gây 401/CORS/socket reject.
- Thiếu Redis/DB hoặc migration chưa chạy → tính năng realtime phụ trợ, lưu trữ, job nền suy giảm/ lỗi.

**Đánh giá Pass 3:** *Liên kết logic ổn; liên kết vận hành **chưa được xác nhận ổn định** trong môi trường hiện tại.*

---

## Pass 4 — Trải nghiệm người dùng (UX)

### Điểm tích cực (quan sát mã)
- **Chat:** optimistic UI, trạng thái gửi/lỗi/đang gửi, ACK timeout (10s) + toast cảnh báo, cuộn cuối, nhóm tin nhắn, badge chưa đọc, tìm kiếm debounce, trạng thái kết nối socket hiển thị.
- **Admin/Player:** bố cục tách kênh chung/riêng, danh sách hội thoại + khung chat, hiển thị tên/role.
- **AI Admin (đã cải tiến):** UI gọn 3 khối, lưu cấu hình + phản hồi áp dụng runtime (khi khả dụng), cảnh báo thay đổi chưa lưu.

### Hạn chế/điểm cần cải thiện
- **Phụ thuộc kết nối:** khi mất realtime hoặc DB, UX chuyển sang cảnh báo/toast nhưng lịch sử có thể trống — cần thông điệp và cơ chế retry/tải lại nhất quán hơn.
- **Presence:** có thể trễ/thiếu trong trường hợp đa instance hoặc snapshot ban đầu chưa tới; `isOnline` từ API search/conversations không phản ánh realtime nếu client chưa merge (đã bổ sung merge phía client).
- **Nhất quán dữ liệu hiển thị:** một số màn hình phụ thuộc dữ liệu tổng hợp từ core/DB; khi backend lỗi sẽ ảnh hưởng cảm nhận “ổn định”.
- **Chưa có đo đạc UX thực tế:** không có kết quả test tải/độ trễ/mất gói trong báo cáo này.

**Đánh giá Pass 4:** *Trải nghiệm **khá** về tính năng/cơ chế, **chưa chứng minh “tốt”** toàn diện dưới điều kiện mạng/tải/hạ tầng thực.*

---

## Pass 5 — Triển khai, cấu hình & vận hành

### Quan sát
- Docker compose tách phụ thuộc và profile `app` cho full stack; có healthcheck và thứ tự phụ thuộc cơ bản. Nginx mẫu proxy `/api/` và `/socket.io/`.
- PM2 ecosystem chạy gateway/core/realtime (worker tuỳ chọn), giới hạn RAM tương đối thấp.
- Biến môi trường bao phủ JWT/internal token/AI/Redis/DB/origins/ports; `.env` dev cần đồng bộ chính xác với dịch vụ thực tế.

### Rủi ro vận hành
- `dist/` có thể lỗi thời so với `src` (đã thấy dấu hiệu ở một số service trước đó) → cần quy trình build/restart chuẩn.
- Thiếu giám sát/log tập trung, cảnh báo sức khỏe, và kiểm thử khói (smoke/E2E) tự động sau deploy.
- Chạy nhiều instance realtime mà không có shared presence/adapter đầy đủ sẽ làm lệch trạng thái online/chat fan-out.

**Đánh giá Pass 5:** *Có nền tảng triển khai; độ ổn định phụ thuộc kỷ luật cấu hình, build, và quan sát vận hành.*

---

## Danh sách kiểm tra khuyến nghị (để đạt “realtime ổn định, liên kết tốt, trải nghiệm tốt”)

### Bắt buộc trước khi kết luận ổn định
1. **Hạ tầng:** Postgres (đúng `DATABASE_URL`, migrations), Redis, realtime, game-core, gateway chạy và healthy.
2. **Cấu hình:** đồng nhất `VITE_API_BASE_URL`, `VITE_REALTIME_URL` (hoặc `/socket.io` qua reverse proxy), `WEB_ORIGIN/ADMIN_ORIGIN`, `JWT_*`, `INTERNAL_SERVICE_TOKEN`.
3. **Build/Deploy:** rebuild `contracts`, `realtime`, `game-core`, `admin`, `web-game` sau thay đổi; restart dịch vụ tương ứng.
4. **E2E Chat:** (a) A↔B gửi/nhận tức thì 2 chiều, (b) mở trước/sau vẫn thấy lịch sử, (c) reload trang giữ lịch sử, (d) unread/reset khi mở hội thoại, (e) online/offline đúng khi đóng/mở tab, (f) reconnect sau rớt mạng.
5. **Kiểm tra lỗi:** DB down, realtime down, token hết hạn — thông báo và phục hồi hợp lý.

### Cải thiện chất lượng
6. **Presence đa instance:** dùng Redis/pubsub hoặc Socket.IO adapter + lưu presence tập trung.
7. **Quan sát:** metrics/log có cấu trúc cho gateway/core/realtime (độ trễ, lỗi ACK, persist fail, reconnect).
8. **Bảo mật/vận hành:** xoay secret, không commit `.env`, chuẩn hóa quy trình deploy.

---

## Ghi chú về môi trường kiểm tra hiện tại
- Kiểm tra dựa trên **mã nguồn và cấu hình trong workspace**; một số kết luận “ổn định/trải nghiệm thực tế” **không thể xác nhận** nếu không chạy đủ dịch vụ. Trước đó từng ghi nhận: DB tại `localhost:5433` có thể **không xác thực được** với `DATABASE_URL` hiện cấu hình, Redis/AI service có thể **chưa chạy**, và workspace có **nhiều thay đổi chưa commit/build đồng bộ** — các yếu tố này trực tiếp ảnh hưởng liên kết và trải nghiệm.

---
*Báo cáo được tạo tự động từ kết quả rà soát mã nguồn/cấu hình (multi-pass) trong phiên làm việc; cần bổ sung kết quả kiểm thử E2E sau khi triển khai môi trường đầy đủ.*
