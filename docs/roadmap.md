# Roadmap triển khai

Thứ tự ưu tiên bám theo GDD, nhưng đi từ nền tảng có thể kiểm chứng trước.

## Phase 0 — Foundation (đã scaffold)

- [x] Monorepo, contract, domain rule, docs ranh giới.
- [x] Auth + character cơ bản, migration nền.
- [x] Gateway, realtime skeleton, worker outbox relay.
- [x] AI service với fake provider + guardrail.
- [x] Chạy `pnpm install`, build/typecheck/test xanh.
- [x] Docker compose backend đầy đủ + migration runner idempotent.
- [x] CI xanh local (format/lint/typecheck/test/build) — workflow sẽ kích hoạt trên push.

## Phase 1 — Vòng đời & tài chính cá nhân

- [x] Game tick thật: aging, health, thu nhập/chi phí (worker/processors/gameTick.ts).
- [x] Credit score cập nhật theo thanh toán (deterministic từ @efls/domain).
- [x] Bảng cân đối, dòng tiền (banking overview: cash/savings/debt/net-worth).
- [x] Vay ngân hàng, grace period (grace_period_end), hạn mức theo tín dụng. Phạt/phát mại để worker tick (next).
- [x] **Chuẩn hóa tiền tệ & định dạng Việt Nam**: Chuyển toàn bộ hệ thống tiền sang VNĐ (`₫`, `triệu ₫`, `tỷ ₫`), hỗ trợ đơn vị tiền tệ VND trong `@efls/contracts` và `@efls/domain`.
- [x] **Thời gian thực & 4 mùa chuẩn Việt Nam**: HUD tự động cập nhật giờ phút (Rạng sáng, Ban ngày, Hoàng hôn, Ban đêm), ngày/tháng/năm và 4 mùa (Xuân, Hạ, Thu, Đông) kèm ambient filter; chỉ admin điều chỉnh, người chơi chỉ xem.
- [x] **Khởi đầu học vấn chuẩn Việt Nam**: Nhân vật mặc định khởi đầu với bằng tốt nghiệp THPT (Cấp 3) và giấy phép lái xe máy A1.
- [ ] Test rule + integration test transaction tiền.

## Hướng dẫn giao diện (UI/UX) — Game 2D nhiều hoạt động

- [x] Thiết kế hệ thống màu game: nền slate-950, accent emerald-500, amber caution, rose danger, indigo action; font mono cho số tiền, Outfit/Inter cho tiêu đề.
- [x] Layout shell game: Top HUD (năm, tiền mặt, năng lượng, heat), sidebar navigation, action bar dưới, Phaser canvas làm màn hình chính.
- [x] Phaser `CityScene`: thành phố 2D top-down, phân khu màu theo zone_type, click tòa nhà mở overlay React tương ứng.
- [x] Component library base: Panel, StatCard, Button, Modal, Toast với bo góc `rounded-2xl`, backdrop-blur, glow subtle, hover scale 1.02.
- [x] Micro-interaction: nút active glow, số tiền tăng giảm đổi màu, check-icon bay khi giao dịch thành công, heat level pulse đỏ khi cao.
- [x] Mapping scene ↔ trang React: City↔CityPage, Ngân hàng↔FinancePage, Chứng khoán↔StockMarketPage, BĐS↔RealEstatePage, Doanh nghiệp↔BusinessPage, Pháp lý↔LawPage, Chợ đen↔UnderworldPage, Offline Recap↔OfflineRecapPage.
- [x] Sprint A (2 tuần): Tailwind theme game + AppLayout shell + CityScene cơ bản + kết nối FinancePage overlay.
- [ ] Sprint B (2 tuần): FinancePage thực tế kết nối API banking, StockMarketPage, RealEstatePage, OfflineRecapPage.

## Phase 2 — Bất động sản & bản đồ

- [ ] Schema map_nodes/roads/properties/buildings/leases.
- [ ] API mua/bán/thuê, xây dựng, thế chấp.
- [x] **Map Editor phân lớp & mở rộng (Admin Panel)**:
  - Cấu hình kích thước bản đồ linh hoạt (số Cột x Dòng), tự động bảo toàn 100% dữ liệu các ô đất cũ khi mở rộng quy mô.
  - Tích hợp cụm nút Zoom điều hướng nhanh (`[−]`, `[%]`, `[+]`) cạnh nút lưu.
  - Phân lớp đồ họa chân thực: Lớp Phân khu quy hoạch (Zones: Đất ở, Thương mại, KCN, Hành chính, Cảng biển, Xóm liều, Công viên, Mặt nước) và Lớp Mạng lưới Giao thông (Roads: Cao tốc, Đường trục chính, Ngõ nội bộ, Cầu vượt).
  - Định giá đất theo m² chuẩn VNĐ.
  - Cơ chế tương tác chuẩn: Click 1 lần hiển thị thông số hiện tại ở thanh dưới; click lần 2 (hoặc double click) gán phân khu/đường mới.
- [ ] Map editor ghi server có version.
- [ ] Phaser render dữ liệu thật, click ô đất.
- [ ] Đấu giá tài sản phát mại.

## Quản trị Vận hành & Lao động (Admin Control Panel)

- [x] **Mùa vụ & Lịch nghỉ Công nhân (`/calendar-seasons`)**:
  - Can thiệp 4 mùa (Xuân, Hạ, Thu, Đông) và thời tiết tức thì (Nắng, Mưa, Bão, Mây).
  - Lịch nghỉ lễ chuẩn Việt Nam (Tết Nguyên Đán, Giỗ Tổ Hùng Vương, 30/4 - 1/5, Quốc khánh 2/9) kèm khả năng thêm ngày nghỉ mới.
  - Quản lý chế độ tiền lương làm thêm giờ (OT 150% - 300% theo Bộ luật Lao động Việt Nam) và tác động năng suất công nhân.
- [x] **Dashboard Vĩ mô Chuẩn Việt Nam**: Chuyển đổi toàn bộ tiền tệ sang VNĐ, đo lường nợ xấu, CPI và cung tiền M2.

## Phase 3 — Doanh nghiệp & chứng khoán

- [ ] Công ty, OPEX, nhân sự, doanh thu.
- [ ] IPO, shareholder, HĐQT.
- [ ] Order book + matching, tick giá, nến realtime.
- [ ] Cổ tức, hostile takeover.
- [ ] Read model thị trường cho dashboard.

## Phase 4 — Pháp lý, xã hội, giáo dục

- [ ] Hôn nhân/prenup, cây gia tộc, di chúc/trust fund.
- [ ] Tòa án + AI thẩm phán (proposal + rule).
- [ ] Bằng cấp, mở khóa tính năng.
- [ ] Audit thuế, tố giác, hủy giấy phép.

## Phase 5 — Chợ đen & thám tử

- [ ] Bằng chứng, blackmail, sting, heist, sabotage.
- [ ] Heat Level, Đại án Công an.
- [ ] Bảo hiểm, vệ sĩ, phòng thủ.
- [ ] Cân bằng kinh tế ngầm.

## Phase 6 — AI nâng cao & vận hành

- [ ] AI news theo cron + tác động giá có biên.
- [ ] NPC đàm phán theo tính cách.
- [ ] GM AI điều chỉnh vĩ mô.
- [ ] Eval prompt, cost/latency dashboard.
- [ ] Load test realtime, order book, tick.
- [ ] Observability: metrics, tracing, alerting.

## Phase 7 — Mở rộng (GDD Module 1–4)

- [ ] Chính trị & bầu cử.
- [ ] Options/futures.
- [ ] Cross-server trade.
- [ ] VR/AR & spatial web.
