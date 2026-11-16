# Báo cáo kiểm tra hệ thống (mã nguồn + vận hành thực tế)

- **Thời điểm kiểm tra:** 2026-11-17 (theo phiên làm việc)
- **Phạm vi:** rà soát cấu hình, dịch vụ đang chạy, cơ chế cập nhật dữ liệu (thời gian thực/polling), và các thay đổi đã triển khai trong phiên.
- **Ghi chú:** một số mục giao diện người dùng cuối (trải nghiệm trên trình duyệt theo từng thao tác cụ thể) không thể kiểm chứng hoàn toàn tự động trong môi trường này; báo cáo nêu rõ những gì đã xác minh từ mã nguồn, cấu hình và hệ thống đang chạy.

## 1) Tóm tắt nhanh

| Hạng mục | Trạng thái quan sát | Ghi chú |
|---|---|---|
| Dịch vụ lõi (Postgres, Redis, game-core, api-gateway, realtime, worker, ai) | **Đang chạy** | `docker ps` cho thấy các container chính ở trạng thái `healthy/up` tại thời điểm kiểm tra. |
| Nhịp thời gian game (server) | **Đúng cấu hình 1 phút thực = 1 ngày game** | Worker tick mỗi ~60.000 ms; `game_state.updated_at` và log tick tăng đều (~mỗi 60 giây). |
| Đồng bộ thời gian tới người dùng | **Đã triển khai push thời gian thực + nội suy phía client** | Worker publish `game:time` qua kênh realtime broadcast; client neo theo `tickUpdatedAt` và cập nhật mượt. Cần làm mới web (5173/5174) nếu chạy dev server. |
| Chat | **Thiết kế theo thời gian thực (socket)** | Có xử lý join/rejoin phòng và gửi tin qua socket (đã sửa/triển khai trong phiên). Phụ thuộc kết nối socket/token/realtime. |
| Thông báo số dư | **Gần thời gian thực theo dữ liệu nhận được** | Toast 3 giây hiển thị khi số dư thay đổi sau khi client nhận dữ liệu nhân vật mới (không phải push sự kiện số dư riêng). |
| Chứng khoán / một số màn hình dữ liệu | **Chủ yếu polling (không hoàn toàn realtime)** | Ví dụ: trang chứng khoán và một số truy vấn có `refetchInterval` (15s/10s). Giá/cập nhật phụ thuộc chu kỳ làm mới. |
| Bảo trì hệ thống | **Đã có chức năng tạm dừng** | Quản trị bật/tắt bảo trì, chặn thao tác người chơi, worker bỏ qua tick khi bảo trì bật; web hiển thị thông báo bảo trì. |
| Bản đồ tỉnh (ngoài Hà Nội) | **Đã xây lại ma trận vùng (sinh động)** | Mỗi tỉnh tạo bản đồ 50x38, đa dạng theo tỉnh, đảm bảo đầy đủ các vùng chức năng và khu nước với phân bổ hợp lý. |

## 2) Hạ tầng & dịch vụ đang chạy (thực tế)

Từ `docker ps` (thời điểm kiểm tra):
- `efls-postgres` (5433->5432) — healthy
- `efls-redis` (6379) — healthy
- `efls-api-gateway` (3000) — healthy
- `efls-game-core` (4000) — healthy
- `efls-realtime` (5000) — healthy
- `efls-worker` (6060) — healthy
- `efls-ai` (8000) — healthy

Kiểm tra nhanh endpoint:
- `GET http://localhost:4000/health` → `{"status":"ok","service":"game-core",...}`
- `GET http://localhost:3000/health` → `{"status":"ok","service":"api-gateway"}`
- `GET http://localhost:5000/health` → `{"status":"ok","service":"realtime"}`

Cơ sở dữ liệu:
- `schema_migrations` mới nhất gồm đến `0062_resize_maps_50x38_rebalance.sql` (đã áp dụng các bản 0060/0061/0062 trong phiên trước).
- `game_state` hiện tại (mẫu quan sát): `current_day=178, current_year=2001, season=summer`, `updated_at` cập nhật gần thời điểm kiểm tra, `maintenance.enabled=false`.

## 3) Thời gian game & mức độ “realtime”

### 3.1 Cấu hình/nguồn chuẩn
- Chuẩn: **1 phút thực = 1 ngày game**, 30 ngày/tháng, 360 ngày/năm, mốc năm 2000 (`packages/domain/src/timeAndSeasons.ts`).
- Worker: chạy tick lặp theo `GAME_TICK_INTERVAL_MS=60000` (`services/worker/src/scheduler.ts`, `services/worker/src/config/env.ts`).

### 3.2 Xác minh vận hành
- Log `efls-worker` cho thấy `Game tick started/committed` liên tục cách nhau ~60 giây.
- `game_state.updated_at` thay đổi theo nhịp tick (mốc neo để suy ra giờ/phút trong ngày).

### 3.3 Đồng bộ tới client
- **Đã cải thiện trong phiên:** worker phát sự kiện `game:time` (broadcast) lên kênh realtime; realtime chuyển tiếp tới tất cả client; client lắng nghe `game:time`, đồng bộ `tickUpdatedAt` và nội suy giờ/phút để hiển thị mượt.
- **Fallback:** client vẫn lấy `/api/v1/game-config` định kỳ (polling) để dự phòng/đồng bộ.
- **Kết luận:** thời gian game ở tầng hệ thống và cơ chế đẩy cập nhật đã hướng **realtime**; độ mượt hiển thị phụ thuộc client đang chạy bản mới và kết nối socket ổn định.

## 4) Realtime theo từng mảng (mã nguồn + cấu hình)

| Mảng | Cơ chế chính | Đánh giá |
|---|---|---|
| Thời gian game | Push `game:time` (socket broadcast) + nội suy client + polling dự phòng | **Realtime (đã bổ sung/cải thiện)** |
| Chat (kênh công khai/riêng) | Socket.IO (`chat:message`, join phòng, rejoin khi reconnect) | **Realtime** khi socket kết nối và xác thực hợp lệ |
| Thông báo hệ thống (notification) | Socket + truy vấn/invalidations phía client | **Gần realtime** (tuỳ luồng phát và tải lại dữ liệu) |
| Biến động số dư (toast 3s) | Phát hiện thay đổi `cash` từ dữ liệu nhân vật đã đồng bộ trên client | **Không phải push sự kiện số dư riêng**; hiển thị khi client nhận dữ liệu mới |
| Thị trường/chứng khoán | Truy vấn API + `refetchInterval` (ví dụ ~15s) trên một số màn hình | **Polling**, chưa realtime hoàn toàn |
| Bản đồ/địa chính (tỉnh) | Sinh dữ liệu bản đồ theo mã tỉnh (server/domain) khi truy vấn | Dữ liệu ổn định theo mã; cập nhật khi tải lại/truy vấn |

> Lưu ý: kết quả tìm kiếm tự động trong phiên cho thấy có sử dụng `refetchInterval` ở một số trang (ví dụ City/Stock). Việc phát sự kiện thị trường realtime (`market:tick`/orderbook) cần được xác minh theo luồng nghiệp vụ cụ thể; hiện tại không đủ bằng chứng trong lần quét nhanh để khẳng định toàn bộ thị trường đã realtime.

## 5) Các thay đổi nổi bật đã thực hiện/triển khai trong phiên

- **Tạm dừng hệ thống (bảo trì):** quản trị bật/tắt, lưu cấu hình, hiển thị thông báo cho người chơi, chặn thao tác người chơi, worker tạm dừng tick khi bảo trì.
- **Đồng bộ thời gian:** sửa luồng phát `game:time` (broadcast đúng kênh realtime), bổ sung hỗ trợ broadcast phía realtime và kiểu sự kiện; client cập nhật theo mốc thời gian server.
- **Thông báo trong ứng dụng:** bấm thông báo để đánh dấu đã đọc (web).
- **Thông báo biến động số dư:** toast nổi 3 giây khi số dư thay đổi (dựa trên dữ liệu nhận được).
- **Chat:** tăng ổn định (rejoin khi kết nối lại, kiểm tra kết nối trước khi gửi) và cập nhật dịch vụ realtime.
- **Khi vắng mặt (offline):** cải thiện cách tạo/hiển thị tóm tắt để tránh dữ liệu gây hiểu nhầm và làm rõ trải nghiệm.
- **Ngôn ngữ/hiển thị:** chuyển nhiều nhãn, thông điệp và lỗi phổ biến sang tiếng Việt dễ hiểu; chuẩn hóa thông báo lỗi phía máy chủ.
- **Bản đồ tỉnh:** xây lại ma trận bản đồ tỉnh (50x38, sinh động, không theo địa giới thực tế), phân bổ vùng hợp lý và **đảm bảo mỗi bản đồ có đầy đủ các vùng chức năng** (dân cư, thương mại, công nghiệp, hành chính/dịch vụ, cảng, khu khó khăn, công viên) cùng khu nước.

## 6) Sự cố đã ghi nhận và xử lý

- **Web tự thoát/đặt lại phiên (cảm giác như tải lại):** đã khắc phục nguy cơ **đăng xuất oan do làm mới phiên đồng thời** (nhiều yêu cầu gặp lỗi xác thực cùng lúc) bằng cơ chế gộp/làm mới phiên an toàn hơn trong client (`apps/web-game/src/shared/api/httpClient.ts`). Khuyến nghị kiểm tra lại trên trình duyệt.
- **Tải lại trang cứng (`window.location.reload`) trong mã nguồn:** chỉ thấy trong luồng hoàn tất kế thừa nhân vật (`DeathSuccessionModal`); không phải hành vi tải lại trong lúc chơi bình thường.

## 7) Trạng thái triển khai & lưu ý vận hành

- Các gói/dịch vụ liên quan đã được build; `efls-game-core`, `efls-worker`, `efls-realtime` đã được cập nhật/khởi động lại trong phiên (tùy thời điểm thay đổi).
- **Web-game (5173) / Admin (5174)** nếu chạy ở chế độ phát triển: cần **khởi động lại hoặc tải lại trang** để nhận đầy đủ thay đổi giao diện và logic client.
- Cây mã nguồn có thay đổi **chưa commit**; không thay đổi dữ liệu lịch sử ngoài các cập nhật cấu hình/tính năng đã thực hiện; không reset `game_state`.

## 8) Khuyến nghị kiểm tra tiếp (thực tế trên trình duyệt)

1. **Thời gian:** xác nhận đồng hồ chạy mượt, đổi ngày đúng nhịp ~1 phút, không nhảy vọt khi nhận cập nhật.
2. **Bảo trì:** bật/tắt từ trang quản trị, kiểm tra người chơi bị chặn và thời gian game dừng, sau đó mở lại bình thường.
3. **Chat:** gửi/nhận giữa tài khoản, thử mất/kết nối lại mạng.
4. **Thông báo & số dư:** nhận thông báo, bấm để đánh dấu đã đọc; kiểm tra toast khi số dư thay đổi.
5. **Bản đồ tỉnh:** mở nhiều tỉnh khác nhau, xác nhận hiển thị đủ các vùng và bố cục hợp lý.
6. **Ổn định đăng nhập:** chơi liên tục > thời gian hết hạn phiên ngắn để xác nhận không bị thoát/“tải lại” bất thường.

## 9) Kết luận

- Hệ thống đang **vận hành ổn định ở mức dịch vụ** (container/health/tick thời gian). 
- **Thời gian game và chat** đã được đưa về hướng **realtime** (với cơ chế dự phòng). 
- **Một số dữ liệu (như thị trường/chứng khoán và vài màn hình)** vẫn dựa nhiều vào **polling định kỳ**, nên chưa phải realtime hoàn toàn theo đúng nghĩa cập nhật tức thời từng biến động.
- Cần một vòng **kiểm thử thực tế trên trình duyệt** theo các kịch bản ở mục 8 để xác nhận trải nghiệm người dùng cuối sau khi làm mới ứng dụng.