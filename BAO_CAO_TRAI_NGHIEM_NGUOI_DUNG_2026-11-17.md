# Báo cáo trải nghiệm người dùng — 17/11/2026

**Phạm vi:** (1) xác minh thuật toán sinh bản đồ procedural mới cho 33 tỉnh/thành (giữ nguyên Hà Nội), (2) tự chạy toàn bộ luồng người dùng trên **web-game (5173)** và **admin (5174)**, ghi nhận hành vi/lỗi thực tế.

**Môi trường chạy:**

| Thành phần | Trạng thái |
|---|---|
| `efls-postgres` / `efls-redis` | healthy |
| `efls-game-core` (4000), `efls-api-gateway` (3000), `efls-realtime` (5000), `efls-worker` (6060), `efls-ai` (8000) | healthy |
| web-game dev `localhost:5173` | chạy |
| admin dev `localhost:5174` | chạy |
| Tài khoản player QA | `qa_tester` / `qa.tester@efls.local` / `Test1234!` (quê Cần Thơ – 092) |
| Tài khoản admin | `admin` / `admin@efls.local` |

> Toàn bộ thay đổi của phiên làm việc này **chưa commit/push**. DB volume, `game_state` và `map_nodes` (Hà Nội) giữ nguyên.

---

## 1. Bản đồ procedural 33 tỉnh — kết quả

### 1.1 Thuật toán (v3)

- `seed = hash(provinceCode)` → PRNG `xmur3 + mulberry32` (deterministic, mỗi tỉnh một chuỗi ngẫu nhiên riêng).
- 3 trường Perlin fBm 4 octave độc lập (terrain / detail / park) + offset và góc xoay riêng theo tỉnh → hình dáng bờ biển, sông, cụm đồi khác nhau.
- 5 nhóm hình thái trong `PROVINCE_MAP_GROUPS`: miền núi & cao nguyên, đồng bằng nội địa, ven biển Đông/ĐN, ven biển Tây/TN, sông nước.
- CBD anchor + 1–2 cực phát triển, cụm công nghiệp/công viên/tự phát/cảng, sông meander + nhánh (delta/riverine), bờ biển meander.
- Weighted zoning 7 vùng + allocator largest-remainder để luôn khớp tỉ lệ; đường lưới + vành đai CBD + cầu (`bridge`) chỉ đặt trên ô nước.
- Chi tiết: `packages/domain/src/provinceMap.ts`; test: `packages/domain/src/provinceMap.test.ts` (6 test pass, toàn bộ 30 test domain pass).

### 1.2 Dữ liệu & phục vụ

- `scripts/reseed-province-maps.mjs --apply`: ghi `map_province_meta` 33 dòng và `map_province_land_prices` ~55.000 ô (56.781 ô theo báo cáo seeder). **Không ghi vào `map_nodes`/`map_meta`**.
- `services/game-core` trả bản đồ tỉnh sinh động từ domain + overlay giá đất theo tỉnh; Hà Nội vẫn đọc 1.900 ô từ DB.
- Artifact: `scripts/out/reseed-province-maps.sql`, `scripts/out/province-maps-preview.html`, `scripts/out/province-map-reseed-report.md`.

### 1.3 Kiểm chứng tỉ lệ (trích báo cáo seeder)

| Mã | Tỉnh/TP | Nhóm | Đất | Nước | CBD | Dân cư | Hành chính | CN | Ngoại ô | Xanh/Núi | Cảng |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 015 | Lào Cai | Núi & cao nguyên | 93.5% | 6.5% | 11.2% | 29.2% | 13.1% | 17.6% | 18.5% | 10.3% | 0% |
| 031 | Hải Phòng | Ven biển Đông | 66.8% | 33.2% | 9.2% | 22.0% | 9.8% | 15.1% | 15.3% | 10.6% | 18.1% |
| 096 | Cà Mau | Ven biển Tây | 62.4% | 37.6% | 11.6% | 23.1% | 11.6% | 14.2% | 15.9% | 8.9% | 14.8% |
| 092 | Cần Thơ | Sông nước | 88.5% | 11.5% | 12.8% | 26.9% | 10.0% | 15.8% | 14.5% | 12.3% | 7.6% |
| 001 | Hà Nội | (DB, v7) | — | — | — | — | — | — | — | — | — |

Tất cả tỉnh nằm trong cửa sổ ±2.5% của tỉ lệ mục tiêu; 0 cảnh báo khi reseed.

### 1.4 Kiểm chứng trực quan & tính duy nhất

- Chuyển tỉnh trên Sidebar: canvas đổi nội dung; hash pixel khác nhau cho 015 / 024 / 031 / 096 / 092 / 001.
- Ảnh chụp bằng chứng (trong `scripts/out/ux-2026-11-17/`):
  - `map-015-lao-cai.jpeg` — sông chạy chéo, nhiều đồi/công viên, ít nước;
  - `map-031-hai-phong.jpeg` — biển lớn phía Đông, cảng ven biển;
  - `map-096-ca-mau.jpeg` — biển phía Tây, dải đất liền hẹp;
  - `map-092-can-tho.jpeg` — mạng sông rạch nhiều nhánh;
  - `map-001-ha-noi.jpeg` — bản đồ lõi cũ, mật độ vàng cam dày đặc (không đổi).
- Bản đồ Hà Nội giữ nguyên tuyệt đối: 50×38, 1.900 ô, version v7, không có bản ghi mới trong `map_nodes`.

### 1.5 Đánh giá

- Đạt yêu cầu “mỗi tỉnh một bộ mặt”: khác nhau về bờ biển/sông, vị trí CBD, cụm công nghiệp, mật độ xanh.
- Tương tác bản đồ: nút `+ / −` đổi render (hash pixel đổi), nút `Lưới` bật/tắt lưới, click ô đất cập nhật panel “Vị trí ô đất / giá khởi điểm / đặt giá”.
- Hạn chế kiểm thử: click mô phỏng bằng `PointerEvent` cho toạ độ ô lệch (ô chọn được nhưng không đúng tâm) — cần kiểm tra lại bằng chuột thật.

---

## 2. Trải nghiệm web-game (localhost:5173)

### 2.1 Luồng đăng ký / đăng nhập

| Bước | Kết quả |
|---|---|
| Mở `/register` | redirect về `/login` (chỉ có một cổng đăng nhập) |
| Chuyển tab “Tạo tài khoản” | **Click chuột thường không phản hồi**; phải focus nút rồi `Enter` mới chuyển mode |
| Nhập họ tên, username, tỉnh sinh (092 Cần Thơ), email, mật khẩu | OK |
| Submit | Tạo tài khoản + nhân vật + CCCD `092 469 709 475`, vào game, nhận 1.000.000 ₫ hỗ trợ từ admin |

**Vấn đề UX:** tab đăng nhập/đăng ký chỉ nhận keyboard, không nhận click — người dùng chuột sẽ tưởng nút hỏng.

### 2.2 Các trang đã chạy

| Trang | Kết quả | Ghi chú |
|---|---|---|
| `/` Thành phố | ✅ | 8 vùng chú giải, zoom, lưới, đấu giá đất, chuyển 34 tỉnh |
| `/character` | ✅ | CCCD, tuổi, tài sản ròng, credit, heat, đổi username/mật khẩu |
| `/education` | ✅ | Danh sách 9 trường, 3 trường seed + 6 trường thật; nút Ghi danh |
| `/recruitment` | ✅ | 0 tin tuyển, thông báo “Bạn đủ điều kiện ứng tuyển”, quy tắc đợt tuyển |
| `/finance` | ✅ | STK, cấp bậc, tiền mặt/tiết kiệm/nợ, credit 650, hạn mức 5.236.364 ₫ |
| `/real-estate` | ✅ | Danh sách BĐS Hà Nội, đề xuất mua, đấu giá phát mãi, nút thuê/mua |
| `/business` | ✅ | 7 công ty niêm yết (EFLS, DEMO2, NMR, HLE, ATF, MDB, VTX), định giá/quỹ |
| `/stocks` | ✅ | 7 ticker, giá biến động theo giờ, KL, danh mục trống, lịch sử trống |
| `/law` | ✅ | Tab tòa án/bằng chứng, hôn nhân/di chúc, thuế & giấy phép |
| `/politics` | ✅ | Thị trưởng đương nhiệm, nhiệm kỳ, kết quả bầu cử, quyên góp |
| `/underworld` | ✅ | Danh sách hành vi phạm tội kèm rủi ro/heat/phần thưởng, giấy tờ giả |
| `/gift-codes` | ✅ | Form nhập mã, lịch sử 0 mã |
| `/recap` | ✅ | Cấu hình offline, tóm tắt thu/chi, log xử lý |
| Chat tổng | ✅ | Gửi/nhận realtime, hiển thị “qa_tester · 11:44”, rate limit 5 tin/3 giây |
| Chuông thông báo | ✅ | 2 thông báo (quyết toán thuế, hỗ trợ 1 triệu từ admin), “Đánh dấu đã đọc” |

Tất cả trang tải dữ liệu thật từ API, không có lỗi console (chỉ warning React Router future flag).

---

## 3. Trải nghiệm admin (localhost:5174)

| Trang | Kết quả | Ghi chú |
|---|---|---|
| `/` Dashboard | ✅ | Tick 59 · Năm 2003, quỹ đất nước 2,3 tỷ ₫, cung tiền 8,85 tỷ, CPI 100.0, 22 nhân vật, vốn hóa 1,51 nghìn tỷ, form điều chỉnh quỹ |
| `/broadcast` | ✅ | Form soạn thông báo, loại/đối tượng nhận |
| `/gift-codes` | ✅ | Trang render (nội dung mỏng) |
| `/calendar-seasons` | ✅ | Mùa & lịch nghỉ |
| `/education-config` | ✅ | Cấu hình giáo dục |
| `/politics` | ✅ | Cấu hình bầu cử |
| `/interest-rates` | ✅ | Lãi suất vay/tiết kiệm |
| `/industry-revenue` | ✅ | Doanh thu công ty 30 ngày |
| `/stock-market-control` | ✅ | Điều chỉnh chứng khoán |
| `/offline` | ✅ | Cấu hình offline |
| `/restriction` | ✅ | Bảo trì & hạn chế |
| `/map-editor` | ✅ | Chọn tỉnh, tải “1900 ô · v7/v2”, ma trận 7 vùng, lưu CSDL |
| `/players` | ✅ | Tìm/cấp tài khoản admin/moderator, can thiệp người chơi |
| `/ai-events` | ✅ | AI & sự kiện |
| `/audit-logs` | ⚠️ | Trang render nhưng bảng **kẹt “Đang tải nhật ký...”**, hiển thị “Hiển thị 0/0” |

Admin đăng nhập đúng vai trò, tự chuyển sang cổng 5174, JWT xác thực.

---

## 4. Lỗi & vấn đề phát hiện (ưu tiên giảm dần)

### P1 — Client coi HTTP 304 là lỗi, gây “Đang tải...” kéo dài và retry

- **Hiện tượng:** nhiều request `GET /api/v1/...` trả **304** (ETag) từ gateway; `apiRequest` kiểm tra `if (!response.ok)` → 304 nằm ngoài 200–299 nên bị ném `ApiError(304)`, React Query retry (`retry: 1`), trang hiện “Đang tải…” thêm 1–10 giây. Có thời điểm các request app treo “pending” rất lâu trong khi `fetch` thủ công cùng URL trả 200 trong ~70ms.
- **Bằng chứng:** network log `/characters/me`, `/education/overview`, `/stock-market/portfolio`, `/stock-market/trades`… trả 304; gateway có header `ETag` và tự trả 304 khi `If-None-Match`.
- **Ảnh hưởng:** trải nghiệm chậm, tăng tải server, có thể che lỗi thật.
- **Đề xuất:** xử lý 304 như cache hit (`if (response.status === 304) return undefined/ cached`), hoặc gửi `Cache-Control: no-store` cho JSON API, hoặc `cache: 'no-store'` + bỏ `If-None-Match` phía client.

### P1 — HUD tiền mặt hiển thị sai/không đồng bộ

- **Hiện tượng:** header hiển thị “Tiền mặt: **15 tr ₫**”, trong khi card ngay dưới và `/finance` là **7.500.000 ₫**; nhiều lần header còn hiện **01/01/2000 00:00** trước khi đồng bộ.
- **Nguyên nhân nghi vấn:** HUD lấy snapshot `characters/me` cũ (staleTime 15s) và không invalidate sau khi xử lý offline/ nhận hỗ trợ admin.
- **Ảnh hưởng:** người chơi hiểu sai số dư, có thể quyết định sai khi mua/bán.
- **Đề xuất:** invalidate `['characters','me']` sau offline process và sau mọi mutation tiền tệ; hiển thị skeleton thay vì giá trị mặc định.

### P2 — Tab “Tạo tài khoản” không nhận click chuột

- Chỉ đổi mode khi nút được focus + `Enter`; click chuột thường (và `MouseEvent` tổng hợp) không có tác dụng.
- **Đề xuất:** dùng `<button type="button" onClick>` thuần, kiểm tra không bị `pointer-events`/overlay chặn.

### P2 — Tự redirect sang `/recap` sau mỗi lần vào game

- Mặc định `showRecapOnLogin = true` → mỗi lần điều hướng/đăng nhập lại bị đẩy sang `/recap`, cắt ngang luồng đang làm.
- Đã giảm nhẹ bằng `PUT /api/v1/offline/settings { showRecapOnLogin: false }`.
- **Đề xuất:** chỉ hiện recap 1 lần/phiên, hoặc dạng modal không đổi route.

### P2 — Dữ liệu học phí seed sai đơn vị

- 3 trường seed: 1.200.000 – 1.800.000 ₫/tháng (24–36 tháng).
- 6 trường thật: **500.000.000 ₫/tháng** (HUST, 48 tháng → 24 tỷ ₫), NEU 400 triệu/tháng, UMP 600 triệu/tháng… chênh ~300 lần.
- **Đề xuất:** rà seed `universities.tuition` (có thể đang lưu minor unit hoặc nhập nhầm), chuẩn hoá VND/tháng.

### P3 — API không tồn tại trả 500 thay vì 404

- `GET /api/v1/characters/education` → **500 internal_error** (đường dẫn đúng là `/education/overview`); các path sai khác trả 404 đúng chuẩn.
- **Đề xuất:** kiểm tra route fallback, tránh 500 cho path không khớp.

### P3 — Audit log admin kẹt loading

- `/audit-logs` hiển thị “Hiển thị 0/0” và “Đang tải nhật ký...” vĩnh viễn. Cần xác định API trả rỗng hay lỗi bị nuốt.

### P3 — Map Editor: bộ chọn tỉnh khó thao tác

- Danh sách 34 tỉnh ở Map Editor không phải `<select>`/`role=option` chuẩn; thao tác chọn bằng bàn phím/automation không ổn định (chọn 092 không đổi được vùng đang cấu hình trong lần kiểm thử này, dù danh sách hiển thị đủ).
- **Đề xuất:** dùng listbox chuẩn (`role="listbox"` + `role="option"`, `aria-activedescendant`) hoặc `<select>`, và kiểm thử lại bằng tay.

### P4 — Nội dung/CRUD còn trống

- Tuyển dụng: 0 tin; BĐS cho thuê: trống; đấu giá phát mãi: trống; danh mục cổ phiếu/lịch sử giao dịch: trống (đúng với nhân vật mới).
- Chính trị: kết quả bầu cử “tttt thắng 100% với 1 phiếu” — dữ liệu test cũ, nên dọn trước demo.

---

## 5. Đề xuất ưu tiên xử lý

1. Sửa `apiRequest` với 304 (+ test) và/hoặc tắt ETag cho JSON API.
2. Đồng bộ HUD tiền mặt/thời gian: invalidate sau offline & mutation, bỏ giá trị mặc định 15tr/2000.
3. Sửa tab đăng ký nhận click; thêm kiểm thử UI cho LoginPage.
4. Chuẩn hoá học phí seed (đơn vị VND/tháng).
5. Rà `/audit-logs` (API + empty state), Map Editor accessibility, path 500 → 404.
6. Dọn dữ liệu demo (bầu cử “tttt”, công ty Demo) trước khi bàn giao.

---

## 6. Kết luận

- Bản đồ procedural 33 tỉnh đạt mục tiêu: khác biệt rõ rệt, đúng tỉ lệ 7 vùng, Hà Nội không bị ảnh hưởng, chuyển tỉnh mượt.
- Hai hệ thống chạy được end-to-end: đăng ký → vào game → xem/sử dụng tất cả trang người chơi; admin đăng nhập → dashboard → cấu hình map/giá đất → các trang quản trị.
- Các lỗi còn lại chủ yếu ở tầng client cache/đồng bộ HUD và vài điểm dữ liệu/UX nhỏ, không chặn luồng chính.
- Chưa commit/push; chờ duyệt.
