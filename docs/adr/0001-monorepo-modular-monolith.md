# ADR 0001 — Monorepo + modular monolith + service biên

- Trạng thái: Accepted
- Ngày: 2026-11-07

## Bối cảnh

Game có nhiều domain kinh tế liên kết chặt: tiền, tài sản, cổ phiếu, doanh nghiệp, pháp lý.
GDD gợi ý microservices (API gateway, core, realtime, worker, AI). Nếu tách mọi domain thành
service ngay, mỗi giao dịch mua bán cần saga giữa nhiều database, tăng rủi ro lệch tiền.

## Quyết định

1. Dùng **monorepo** với pnpm workspace + Turborepo.
2. `game-core` là **modular monolith**: nhiều bounded context trong một deployable, một database.
3. Chỉ tách vật lý các thành phần có lý do rõ:
   - `realtime` (Socket.IO, scale kết nối).
   - `worker` (job nền, game tick).
   - `ai` (Python, provider LLM, vòng đời khác).
   - `api-gateway` (điểm vào, auth, rate limit).
4. Frontend tách `web-game` và `admin`.

## Hệ quả

Tích cực:

- Transaction ACID cho tiền/tài sản/cổ phiếu.
- Refactor ranh giới module dễ trước khi tách service.
- Chia sẻ contract/domain rule, giảm trùng lặp.
- CI một pipeline.

Tiêu cực:

- Một deployable core có thể thành điểm nghẽn scale; giải quyết bằng read model/worker,
  chỉ tách module nóng khi có số liệu.
- Kỷ luật import quan trọng hơn; cần review ranh giới.

## Khi xem xét lại

- Một module có tải/đội ngũ/vòng đời deploy khác biệt rõ.
- Ranh giới dữ liệu đã ổn định và có event contract.
- Tách service giảm rủi ro vận hành nhiều hơn chi phí saga.
