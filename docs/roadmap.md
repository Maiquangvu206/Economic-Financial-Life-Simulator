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
- [x] **Chuẩn hóa tiền tệ & định dạng Việt Nam**: Chuyển toàn bộ hệ thống tiền sang VNĐ (`₫`, `triệu ₫`, `tỷ ₫`), hỗ trợ đơn vị tiền tệ VND trong `@efls/contracts` và `@efls/domain`. Migration `0004_currency_vnd.sql` đặt mặc định `VND` cho `ledger_accounts` và backfill dữ liệu USD cũ.
- [x] **Thời gian thực & 4 mùa chuẩn Việt Nam**: HUD tự động cập nhật giờ phút (Rạng sáng, Ban ngày, Hoàng hôn, Ban đêm), ngày/tháng/năm và 4 mùa (Xuân, Hạ, Thu, Đông) kèm ambient filter; chỉ admin điều chỉnh, người chơi chỉ xem.
- [x] **Hiệu ứng Ngày Lễ, Tết & Lì xì Phúc lợi**:
  - Khi đến ngày Tết hoặc Lễ lớn (Tết Nguyên Đán, 30/4 - 1/5, 2/9, Giỗ Tổ Hùng Vương), bản đồ thành phố 2D của Phaser tự động kích hoạt hiệu ứng **Pháo hoa chào mừng** (`FireworksLayer`).
  - Hệ thống tự động gửi **Thư chúc mừng Lễ/Tết** của UBND & Quỹ Phúc lợi xã hội kèm tiền Lì xì/thưởng Tết (**+2.000.000 ₫** dịp Tết, **+1.000.000 ₫** dịp Lễ) trực tiếp vào tài khoản ngân hàng của người chơi.
- [x] **Khởi đầu học vấn chuẩn Việt Nam**: Nhân vật mặc định khởi đầu với bằng tốt nghiệp THPT (Cấp 3) và giấy phép lái xe máy A1.
- [x] **Test rule + integration test transaction tiền**: `services/game-core/src/shared/ledger/ledger.integration.test.ts` (2 tests: chuyển tiền đồng bộ số dú + từ chối vượt hạn mức), chạy qua `pnpm --filter @efls/game-core test`.

## Hướng dẫn giao diện (UI/UX) — Game 2D nhiều hoạt động

- [x] **Giao diện sáng pastel toàn hệ thống**: nền `surface` sáng (trắng / xanh phớt), gradient pastel nhẹ theo mùa, accent emerald, amber caution, rose danger, indigo action; font mono cho số tiền, Outfit/Inter cho tiêu đề. Áp dụng đồng bộ cho cả `web-game` và `admin` (Tailwind token + component + Phaser).
- [x] Layout shell game: Top HUD (ngày/tháng/năm, giờ, mùa, tiền mặt, năng lượng, heat), sidebar navigation, Phaser canvas làm màn hình chính.
- [x] Phaser `CityScene`/`MapScene`: thành phố 2D top-down nhiều lớp (địa hình, giao thông, công trình, trang trí, chọn, pháo hoa), bảng màu pastel, click tòa nhà mở overlay React tương ứng.
- [x] Component library base: Panel, StatCard, Button, Modal, Toast, Badge, Input với bo góc `rounded-2xl`, nền trắng mờ, bóng mềm, hover nhẹ.
- [x] Micro-interaction: nút active glow, số tiền tăng giảm đổi màu, check-icon bay khi giao dịch thành công, heat level pulse đỏ khi cao.
- [x] Mapping scene ↔ trang React: City↔CityPage, Ngân hàng↔FinancePage, Chứng khoán↔StockMarketPage, BĐS↔RealEstatePage, Doanh nghiệp↔BusinessPage, Pháp lý↔LawPage, Chợ đen↔UnderworldPage, Offline Recap↔OfflineRecapPage.
- [x] Sprint A (2 tuần): Tailwind theme game + AppLayout shell + CityScene cơ bản + kết nối FinancePage overlay.
- [x] Sprint B (2 tuần): **FinancePage** (tổng quan tài khoản, vay/trả nợ, gửi/rut tiết kiệm), **RealEstatePage** (mua/đặt bán/cho thuê + đấu giá), **StockMarketPage** (danh sách mã, đặt lệnh mua/bán, danh mục, lịch sử giao dịch) và **OfflineRecapPage** (báo cáo offline dimostasi) đã kết nối API thực tế.

## Phase 2 — Bất động sản & bản đồ

- [x] Schema map_nodes/roads/properties/buildings/leases.
  - `map_nodes`: thêm loại vùng `water`, `park`; thêm `land_price_minor` (VNĐ minor units).
  - `map_roads`: đường giao thông mỗi ô (`highway`, `arterial`, `local`, `bridge`, `none`).
  - `map_meta`: phiên bản bản đồ (`version`, `cols`, `rows`).
  - Migration `0005_map_phase2.sql` + down; `0006_map_timestamps.sql` bổ sung `created_at`/`updated_at` cho `map_nodes`.
- [x] API mua/bán/thuê, xây dựng, thế chấp.
  - `GET /api/v1/map` — toàn bộ bản đồ (nút, đường, phiên bản) cho render người chơi.
  - `PUT /api/v1/map` — quản trị viên lưu bản đồ, xử lý xung đột theo phiên bản (409 Conflict nếu phiên cũ).
  - `GET /api/v1/real-estate/overview` — danh sách BĐS, tài sản sở hữu, giá trị danh mục, thu thuê tháng.
  - `POST /api/v1/real-estate/buy` — mua bất động sản (chưa có chủ / đang bán), đồng bộ ledger.
  - `POST /api/v1/real-estate/list` — chủ sở hữu đặt bán.
  - `POST /api/v1/real-estate/rent` — cho thuê, tạo hợp đồng thuê active.
- [x] **Map Editor phân lớp & mở rộng (Admin Panel)**:
  - Cấu hình kích thước bản đồ linh hoạt (số Cột x Dòng), tự động bảo toàn 100% dữ liệu các ô đất cũ khi mở rộng quy mô.
  - Tích hợp cụm nút Zoom điều hướng nhanh (`[−]`, `[%]`, `[+]`) cạnh nút lưu.
  - Phân lớp đồ họa chân thực: Lớp Phân khu quy hoạch (Zones: Đất ở, Thương mại, KCN, Hành chính, Cảng biển, Xóm liều, Công viên, Mặt nước) và Lớp Mạng lưới Giao thông (Roads: Cao tốc, Đường trục chính, Ngõ nội bộ, Cầu vượt).
  - Định giá đất theo m² chuẩn VNĐ.
  - Cơ chế tương tác chuẩn: Click 1 lần hiển thị thông số hiện tại ở thanh dưới; click lần 2 (hoặc double click) gán phân khu/đường mới.
- [x] **Map editor ghi server có version**: tải bản đồ từ server, lưu lên server với kiểm soát phiên bản (optimistic concurrency), thông báo xung đột 409.
- [x] **Phaser render dữ liệu thật, click ô đất**: MapScene render terrain/đường/công trình từ server; CityPage click ô đất hiển thị chi tiết + nút mua, phản hồi sở hữu ngay sau khi giao dịch.
- [x] **Đấu giá tài sản phát mại**: Migration `0007_auctions.sql` tạo bảng `auctions` (giá khởi điểm, giá cao nhất, thời gian kết thúc, trạng thái). Contracts `http/auction.ts` (AuctionDto, PlaceBid/Create/Cancel request). Module `auctions` (repository/service/controller/routes) với API `GET /api/v1/auctions`, `POST /api/v1/auctions/:id/bid`, `POST /api/v1/auctions/:id/end`, `POST /api/v1/auctions/cancel`, `POST /api/v1/auctions` (tạo). Tiền đặt giá giữ trong escrow, hoàn trả khi bị vượt giá, thanh toán người bán và chuyển chủ sở hữu khi phiên kết thúc. Đã kiểm thử API end-to-end (tạo, đặt giá, từ chối giá thấp).

## Quản trị Vận hành & Lao động (Admin Control Panel)

- [x] **Trung tâm Thông báo Hệ thống (`/broadcast`)**:
  - Soạn thảo và phát sóng thông báo khẩn cấp (Urgent), bảo trì server, sự kiện/lễ hội, chính sách kinh tế/thuế hoặc bản tin thành phố.
  - Phân vùng đối tượng nhận tin: Toàn bộ máy chủ, riêng Lực lượng Công nhân, Giới Đầu tư hoặc Chủ Doanh nghiệp.
  - Hỗ trợ ghim thông báo (Pinned announcement) trực tiếp lên thanh tiêu đề/HUD người chơi và quản lý lịch sử phát sóng.
- [x] **Mùa vụ & Lịch nghỉ Công nhân (`/calendar-seasons`)**:
  - Can thiệp 4 mùa (Xuân, Hạ, Thu, Đông) và thời tiết tức thì (Nắng, Mưa, Bão, Mây).
  - Lịch nghỉ lễ chuẩn Việt Nam (Tết Nguyên Đán, Giỗ Tổ Hùng Vương, 30/4 - 1/5, Quốc khánh 2/9) kèm khả năng thêm ngày nghỉ mới.
  - Quản lý chế độ tiền lương làm thêm giờ (OT 150% - 300% theo Bộ luật Lao động Việt Nam) và tác động năng suất công nhân.
- [x] **Dashboard Vĩ mô Chuẩn Việt Nam**: Chuyển đổi toàn bộ tiền tệ sang VNĐ, đo lường nợ xấu, CPI và cung tiền M2.
- [x] **Nhật ký Can thiệp & Kiểm toán Hệ thống (`/audit-logs`)**: Ghi nhận toàn bộ thao tác can thiệp của Quản trị viên (Actor, IP, Hành động, Mục tiêu, Chi tiết, Trạng thái) phục vụ kiểm toán và an ninh.

## Xác thực & Phân quyền (Auth)

- [x] **Một cổng đăng nhập duy nhất** tại `web-game /login`: người chơi và quản trị viên dùng chung một trang; server trả về vai trò và hệ thống tự định tuyến.
  - `player` → vào thẳng ứng dụng game.
  - `admin` / `moderator` → portal xin mã bàn giao dùng một lần (`POST /auth/sso/handoff`), chuyển sang `admin /sso?code=…`, admin đổi mã lấy phiên (`POST /auth/sso/exchange`) rồi mở bảng điều khiển.
  - Mã bàn giao sống 60 giây, chỉ dùng được một lần, không lộ token trên URL.
- [x] Cổng duy nhất hỗ trợ cả **đăng nhập** và **đăng ký** tài khoản công dân mới.
- [x] **Route guard**:
  - `web-game`: `RequireAuth` chặn mọi route riêng tư khi chưa đăng nhập, `RedirectIfAuthenticated` đẩy người đã đăng nhập khỏi trang login.
  - `admin`: không còn trang login riêng — `RequireAdmin` tự chuyển về cổng chung khi chưa có phiên; sai vai trò hiện màn hình 403.
- [x] **Token & refresh**: JWT access token gắn vào mọi request; tự động refresh một lần khi gặp 401 rồi gửi lại; hết hạn hoàn toàn thì xóa phiên và quay về cổng đăng nhập.
- [x] **Server-side enforcement**: gateway xác thực JWT và `requireRole('admin','moderator')` cho `/api/v1/admin`; người chơi gọi API admin nhận HTTP 403 `Insufficient role`; thiếu token nhận 401.
- [x] **Đăng xuất** ở cả hai layout, xóa phiên lưu trữ và đưa về cổng đăng nhập chung.
- [x] **Kiểm thử thực tế**: đăng ký/đăng nhập, player → admin API = 403, không token = 401, sai mật khẩu = 401, refresh token sai = 401, admin hợp lệ = 200, luồng bàn giao SSO một lần.

## Phase 3 — Doanh nghiệp & chứng khoán

- [x] **Công ty, OPEX, nhân sự, doanh thu**: Module `corporations` + API `GET /api/v1/corporations`, `GET /:id`, `POST /` (thành lập, trừ vốn từ ví cá nhân), `POST /:id/invest` (đầu tư vốn, đồng bộ cash/valuation qua ledger). Contracts `http/companies.ts` (`CompanyDto`, `CreateCompanyRequest`, `CompanyInvestRequest`, `CompanyOverviewDto`).
- [x] **IPO, cổ cổ đông, HĐQT**: `POST /:id/ipo` (chuyển status sang 'ipo', tạo `stock_ticker`, cấp cổ phiếu ban đầu cho chủ sở hữu), `POST /:id/dividend` (phát cổ tức theo tỉ lệ sở hữu, trừ tiền công ty, phân chia đến từng cổ đông), `POST /:id/takeover` (khiêu kích thác đoá khi sở hữu >51% cổ phiếu, chuyển chủ sở hữu mới).
- [x] **Order book + matching, tick giá, nến realtime**: Module `stock-market` với engine khớp lệnh giá–thời ưu tiên (`POST /orders` tự khớp lệnh mua/bán, escrow tiền mua, chuyển cổ phiếu sau khớp), `GET /orderbook/:tickerId` (sổ lệnh mua/bán), `GET /snapshot` (tổng vốn thị trường, khối lượng 24h), `GET /portfolio` (cổ phiếu sở hữu, lệnh mở, lãi/lỗ), `GET /trades` (lịch sử giao dịch).
- [x] **Read model thị trường cho dashboard**: `GET /api/v1/stock-market/snapshot` cung cấp tổng vốn, danh sách mã, thay đổi giá 24h.

## Phase 4 — Pháp lý, xã hội, giáo dục

- [x] **Hôn nhân/prenup, cây gia tộc, di chúc/trust fund** — Migration `0008_phase4.sql` (bảng `marriage_contracts`) + module `social` (`GET /api/v1/social/overview`, `POST /marriage/marry`, `POST /marriage/divorce`, `POST /will`, `POST /trust-fund/deposit`), contracts `http/social.ts`.
- [x] **Tòa án + AI thẩm phán (proposal + rule)** — Module `law` (`GET /api/v1/law/overview`, `POST /cases`, `POST /evidence`, `POST /cases/:caseId/trial`): AI đề xuất verdict theo độ mạnh bằng chứng, core áp ngưỡng cứng 60/100 để chốt bản án, ghi án tích, trừ phạt qua ledger, bảng `evidences`.
- [x] **Bằng cấp, mở khóa tính năng** — Module `education` (`GET /api/v1/education/overview`, `POST /enroll`, `POST /graduate`): seed 6 trường VN, học phí trừ qua ledger (`tuition_payments`), tốt nghiệp mở khóa IPO / tự bào chữa / giảm rủi ro audit / ghế HĐQT, cộng `skill_progress`. Contracts mở rộng `http/careers.ts`.
- [x] **Audit thuế, tố giác, hủy giấy phép** — Module `tax` (`GET /api/v1/tax/overview`, `POST /assess`, `POST /pay`, `POST /audit/start`, `POST /report`, `POST /licenses/revoke`): thuế 10% trên tiền mặt, kiểm toán theo risk = heat + nợ quá hạn (≥60 bị phạt 10%), tố giác tăng heat của target, thu hồi `business_licenses`. Contracts mở rộng `http/tax.ts`.
- [x] **UI Phase 4** — `LawPage` viết lại thành tabbed page (Tòa án & Bằng chứng / Hôn nhân & Di chúc / Thuế & Giấy phép) với modal nộp bằng chứng, kết hôn, di chúc, nạp trust fund, tố giác; `EducationPage` mới (ghi danh, tốt nghiệp, mở khóa); route `/education` + điều hướng sidebar.

## Phase 5 — Chợ đen & thám tử

- [x] **Bằng chứng, blackmail, sting, heist, sabotage** — Migration `0011_phase5.sql` (bảng `underworld_evidences`, `sting_operations`) + module `underworld` (`GET /api/v1/underworld/overview`, `POST /crime`, `/evidence/collect` (thuê thám tử, tạo `mercenary_orders`), `/evidence/sell`, `/evidence/submit` (nộp tòa, tạo `court_cases` + `evidences`), `/blackmail/start`, `/blackmail/:id/collect`, `/sting`). Catalog 8 dịch vụ ngầm cân bằng rủi ro–tiền thưởng, xúc xắc bị bắt = `risk + heat/4`, payout từ `market`, phạt chuyển `government`, ghi án tích + mở vụ án.
- [x] **Heat Level, Đại án Công an** — Dùng rule `@efls/domain` (`applyHeat`, `shouldTriggerSweep`): mọi hành vi phi pháp cộng heat vào `heat_events` + `characters.heat_level`; `POST /sweep/trigger` (và tự động sau khi crime đẩy heat ≥ 80/manhunt): phạt 10% tiền mặt, giam 30 ngày, hạ heat về 40, ghi `police_sweeps`, phát event `sweep.triggered.v1`.
- [x] **Bảo hiểm, vệ sĩ, phòng thủ** — Bảng `insurance_policies`, `POST /protection/buy` (vệ sĩ 5tr/tháng bảo vệ 20tr, bảo hiểm 10tr bảo vệ 100tr, trừ phí qua ledger, hạ heat −2). Giấy tờ giả: `POST /credentials/buy` (fake_id 2tr / business_license 8tr / shell_company 15tr, quality ngẫu nhiên 40–90, bảng `fake_credentials`).
- [x] **Cân bằng kinh tế ngầm** — Payout/nguy cơ/heat theo catalog (VD `heist` 20–100tr, rủi ro 50%, heat +18; `forgery` 1–5tr, rủi ro 10%); `undergroundEarned` tính thu nhập ngầm 30 ngày từ ledger `kind LIKE 'crime_%'`; mua dịch vụ trừ qua ledger `market`.
- [x] **UI Phase 5** — `UnderworldPage` viết lại thành tabbed page (Dịch vụ ngầm / Thám tử & Bằng chứng / Tống tiền & Gài bẫy / Bảo vệ & Đại án) + modal thuê thám tử, mở tống tiền, gài bẫy; StatCard heat/thu nhập ngầm/bằng chứng/giấy tờ giả; Contracts mở rộng `http/underworld.ts`.

## Phase 6 — AI nâng cao & vận hành

- [x] **AI news theo cron + tác động giá có biên** — Worker `aiNews` processor viết lại (trước đây là stub): gọi AI `POST /v1/news`, clamp `stock_impact_pct` trong [−20,20] theo contracts + chỉ áp dụng tối đa ±5% mỗi mã vào `stock_tickers.current_price_minor` (không dưới 1.000 ₫), ghi `news_items`, phát tán qua `notifications` + outbox `news.published.v1`. Scheduler cron giữ nguyên `AI_NEWS_CRON` (mặc định 6h sáng).
- [x] **NPC đàm phán theo tính cách** — Game-core module `npc`: `POST /api/v1/npc/negotiate` (AI đề xuất dialogue, core chốt bằng rule `@efls/domain` `evaluateNpcDeal`: ngưỡng chấp nhận theo tính cách aggressive 0.85 / cautious 0.95 / greedy 0.9 / honest 1.0, band counter greedy 1.35–1.6×), `GET /npc/history`, bảng `npc_negotiations`, contracts `http/observability.ts`. UI tab "NPC Đàm phán" trong `UnderworldPage`.
- [x] **GM AI điều chỉnh vĩ mô** — Worker `gmTick` processor (cron mỗi giờ, queue `gm-tick`): chụp snapshot (lạm phát/thất nghiệp/cung tiền M2 từ `ledger_accounts`/vốn hoá thị trường), gọi AI `/v1/gm/propose`, áp biên qua rule `applyGmAdjustment` (lãi suất chốt 0.5–15%, lạm phát 0–20%), cập nhật `game_state.macro`, ghi `gm_directives` + outbox `gm.directive.v1`. Game-core module `gm`: `GET /gm/snapshot`, `POST /gm/adjust` (thủ công), `GET /gm/directives`.
- [x] **Eval prompt, cost/latency dashboard** — Worker `aiClient` ghi mọi lần gọi AI vào `ai_metrics` (task/model/prompt version/latency/tokens/cost_usd/status, chi phí ước lượng $0.002/1k tokens); game-core `GET /observability/ai` tổng hợp theo task; Admin `AiEventConsolePage` mở rộng thêm StatCard tổng gọi/chi phí/độ trễ/tỷ lệ lỗi + bảng metrics 50 bản ghi mới nhất + panel GM snapshot/directives. Eval domain: 12 tests pass (7 cũ + 5 mới cho NPC/GM rule).
- [x] **Load test realtime, order book, tick** — Script `scripts/loadtest.mjs` (`pnpm loadtest`): bắn đồng thời vào 6 endpoint gateway, tính p50/p95/avg/max + success rate, in báo cáo JSON (env `EFLS_TOKEN`, `EFLS_CONCURRENCY`, `EFLS_ROUNDS`).
- [x] **Observability: metrics, tracing, alerting** — Game-core thêm `GET /metrics` (Prometheus: `efls_http_requests_total` đếm in-memory, `efls_outbox_pending` từ DB, `efls_uptime_seconds`) kèm `GET /health` đã có; pino-http ghi requestId làm tracing cơ bản; worker `/health` trên cổng 6060. Alerting: rate-limit/auth đã có; gợi ý dùng Prometheus + Alertmanager scrape `/metrics`.

## Phase 7 — Mở rộng (GDD Module 1–4) — rút gọn: chỉ giữ Chính trị

- [x] **Chính trị & bầu cử (Thị trưởng)** — Migration `0013_phase7.sql` (bảng `elections`, `candidates`, `votes`) + module `politics` (`GET /api/v1/politics/overview`, `POST /api/v1/politics/elections`, `/candidacy` (phí 5tr), `/vote` (1 người 1 phiếu), `/donate` (1tr = +10 điểm theo rule `@efls/domain` `candidateScore`), `/elections/:id/end` chốt winner theo `electionWinner` deterministic), contracts `http/politics.ts`. UI `PoliticsPage` (route `/politics`, sidebar "Chính trị").
- [x] **Kết quả do admin chốt (không phải người chơi)** — `POST /politics/elections/:id/end` yêu cầu role `admin`/`moderator` (kiểm tra `req.actorRole` trong service, trả 403 `forbidden` nếu là player); người chơi chỉ xem kết quả sau khi admin chốt. Nút UI ghi "Chốt kết quả (admin)".
- [x] **Đã loại bỏ theo yêu cầu**: Options/futures, Cross-server trade, VR/AR & spatial web (module, contracts, UI, realtime room `spatial`, bảng DB `futures_contracts`/`cross_server_listings`/`spatial_sessions` đã DROP qua migration `0014_drop_phase7_extra.sql`). Realtime giữ lại `election_room` + event `election:votes` phục vụ chính trị.
