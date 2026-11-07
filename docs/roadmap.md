# Roadmap triển khai

Thứ tự ưu tiên bám theo GDD, nhưng đi từ nền tảng có thể kiểm chứng trước.

## Phase 0 — Foundation (đã scaffold)

- [x] Monorepo, contract, domain rule, docs ranh giới.
- [x] Auth + character cơ bản, migration nền.
- [x] Gateway, realtime skeleton, worker outbox relay.
- [x] AI service với fake provider + guardrail.
- [ ] Chạy `pnpm install`, build/typecheck/test xanh.
- [ ] Docker compose postgres/redis + migration chạy thật.
- [ ] CI xanh trên repo.

## Phase 1 — Vòng đời & tài chính cá nhân

- [ ] Game tick thật: aging, health, thu nhập/chi phí.
- [ ] Credit score cập nhật theo thanh toán.
- [ ] Bảng cân đối, dòng tiền, offline recap.
- [ ] Vay ngân hàng, grace period, phạt, phát mại.
- [ ] Test rule + integration test transaction tiền.

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
