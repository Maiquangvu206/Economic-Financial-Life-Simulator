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

- [ ] Game tick thật: aging, health, thu nhập/chi phí.
- [x] Credit score cập nhật theo thanh toán (deterministic từ @efls/domain).
- [x] Bảng cân đối, dòng tiền (banking overview: cash/savings/debt/net-worth).
- [x] Vay ngân hàng, grace period (grace_period_end), hạn mức theo tín dụng. Phạt/phát mại để worker tick (next).
- [ ] Test rule + integration test transaction tiền.

## Hướng dẫn giao diện (UI/UX) — Game 2D nhiều hoạt động

- [ ] Thiết kế hệ thống màu game: nền slate-950, accent emerald-500, amber caution, rose danger, indigo action; font mono cho số tiền, Outfit/Inter cho tiêu đề.
- [ ] Layout shell game: Top HUD (năm, tiền mặt, năng lượng, heat), sidebar navigation, action bar dưới, Phaser canvas làm màn hình chính.
- [ ] Phaser `CityScene`: thành phố 2D top-down, phân khu màu theo zone_type, click tòa nhà mở overlay React tương ứng (ngân hàng → FinancePage, sàn giao dịch → StockMarketPage, v.v.).
- [ ] Component library base: Panel, StatCard, Button, Modal, Toast với bo góc `rounded-2xl`, backdrop-blur, glow subtle, hover scale 1.02.
- [ ] Micro-interaction: nút active glow, số tiền tăng giảm đổi màu, check-icon bay khi giao dịch thành công, heat level pulse đỏ khi cao.
- [ ] Mapping scene ↔ trang React: City↔CityPage, Ngân hàng↔FinancePage, Chứng khoán↔StockMarketPage, BĐS↔RealEstatePage, Doanh nghiệp↔BusinessPage, Pháp lý↔LawPage, Chợ đen↔UnderworldPage, Offline Recap↔OfflineRecapPage.
- [ ] Sprint A (2 tuần): Tailwind theme game + AppLayout shell + CityScene cơ bản + kết nối FinancePage overlay.
- [ ] Sprint B (2 tuần): FinancePage thực tế kết nối API banking, StockMarketPage, RealEstatePage, OfflineRecapPage.

## Phase 2 — Bất động sản & bản đồ

- [ ] Schema map_nodes/roads/properties/buildings/leases.
- [ ] API mua/bán/thuê, xây dựng, thế chấp.
- [ ] Map editor ghi server có version.
- [ ] Phaser render dữ liệu thật, click ô đất.
- [ ] Đấu giá tài sản phát mại.

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
