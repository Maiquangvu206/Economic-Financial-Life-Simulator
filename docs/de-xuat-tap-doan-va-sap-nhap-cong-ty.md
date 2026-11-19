# Đề xuất: Tập đoàn & Sáp nhập công ty (EFLS)

Tài liệu dùng để **chốt phạm vi/thiết kế** trước khi triển khai.

## 1. Hiện trạng (đã rà soát trong codebase)

- **Có:** thâu tóm (takeover) công ty **đã IPO** khi nắm **> 51% cổ phần** → chuyển quyền **chủ sở hữu** (UI `apps/web-game/src/pages/BusinessPage.tsx`, API/service tại `services/game-core/src/modules/corporations/*`). Đây là chuyển quyền kiểm soát, không phải sáp nhập pháp nhân.
- **Có:** vận hành per-company — cổ phần/cổ đông, IPO & thị trường, chốt doanh thu kỳ (`company_revenue_settlements`), thuế/kê khai, lương/payroll/nhân sự, giấy phép, trụ sở/địa điểm, sổ cái/ledger.
- **Chưa có:** cơ chế **sáp nhập/gộp nhất công ty** (merge) và **tập đoàn/công ty mẹ–con** (conglomerate/holding group).

## 2. Mục tiêu & nguyên tắc

- **Giữ mô phỏng per-company:** doanh thu kỳ, thuế, lương, giấy phép, trụ sở, sổ cái tiếp tục theo từng pháp nhân (trừ khi sáp nhập thực sự ở pha sau).
- **Bổ sung theo bậc, rủi ro tăng dần:**
  - **(A) Tập đoàn/quan hệ mẹ–con:** gom quản trị & báo cáo, pháp nhân tách biệt (MVP, ít rủi ro).
  - **(B) Mua lại toàn bộ (buyout 100%):** chuẩn bị điều kiện sở hữu thống nhất.
  - **(C) Sáp nhập pháp nhân:** gộp thành một công ty (phức tạp, pha sau).
- **Server-authoritative, minh bạch:** điều kiện rõ, giao dịch/bút toán/audit log, idempotent, có xác nhận.

**Lộ trình khuyến nghị:** Pha 1 **(A) Tập đoàn MVP** → Pha 2 **(B) Buyout 100%** → Pha 3 **(C) Sáp nhập A→B**.

---

## 3. Pha 1 – Tập đoàn / Công ty mẹ–con (MVP, đề xuất triển khai trước)

### 3.1 Khái niệm
- **Tập đoàn (Group)** là thực thể quản trị gom nhiều công ty thành viên. Mỗi công ty **vẫn là pháp nhân/sổ sách riêng** (chốt doanh thu kỳ, thuế, lương, giấy phép, địa điểm, ticker… giữ nguyên).
- Quan hệ mẹ–con dựa trên **quyền kiểm soát** (tỷ lệ cổ phần/quyền biểu quyết), không bắt buộc mua 100% ở pha này.

### 3.2 Phạm vi chức năng MVP (đề xuất)
- **Quản trị:** tạo/đổi tên/giải tán tập đoàn; đặt công ty mẹ (holding); thêm/gỡ công ty thành viên khi đủ điều kiện.
- **Báo cáo hợp nhất (read-only, tổng hợp từ dữ liệu hiện có, không gộp sổ cái/thuế/lương/tiền):**
  - Danh sách/cây mẹ–con và % kiểm soát.
  - Tổng quỹ/cash (cộng theo công ty), tổng doanh thu theo kỳ (cộng từ `company_revenue_settlements`), tổng nhân sự/payroll dự kiến, tình trạng thuế/kê khai & giấy phép theo từng công ty.
  - Liên kết nhanh tới từng công ty.
- **Không làm ở MVP:** chuyển tiền/lương/thuế giữa pháp nhân, lợi ích/buff gameplay, sáp nhập.

### 3.3 Điều kiện & quyền (đề xuất mặc định)
| Hạng mục | Đề xuất mặc định | Ghi chú/tuỳ chọn |
|---|---|---|
| Công ty mẹ/holding | **Có**: mỗi tập đoàn gắn **1 công ty mẹ (holding)** thuộc nhóm | Tuỳ chọn: nhóm thuần theo nhân vật, không bắt buộc holding |
| Ai quản trị nhóm | **Chủ tập đoàn** = nhân vật kiểm soát công ty mẹ (chủ sở hữu/kiểm soát) | Chỉ chủ tập đoàn được tạo/sửa/thêm-gỡ thành viên |
| Ngưỡng vào nhóm (con/thành viên) | **> 50% cổ phần/quyền kiểm soát** (theo `company_shareholders`, áp dụng cả chưa IPO/đã IPO) | Tuỳ chọn: yêu cầu 100% |
| Trạng thái công ty | `active`, **không** `bankrupt` | Có thể bổ sung yêu cầu giấy phép active nếu muốn |
| Ràng buộc | Mỗi công ty chỉ thuộc **1 tập đoàn** tại một thời điểm; **không tạo vòng lặp** | Tự gỡ/đánh dấu khi mất kiểm soát (≤ 50%), phá sản/giải thể |
| Quyền xem dashboard | **Chủ tập đoàn** xem toàn bộ; **chủ sở hữu công ty thành viên** xem thông tin công ty mình trong nhóm | Tuỳ chọn: chỉ chủ tập đoàn |
| Quyền vận hành | Thuế, lương, OPEX, địa điểm, kê khai… **vẫn do chủ sở hữu từng công ty** (như hiện tại) | Tránh xung đột quyền ở MVP |
| Lợi ích/buff gameplay | **Không** ở MVP (thuần quản trị/báo cáo) | Cân bằng ở pha sau nếu cần |

### 3.4 Dữ liệu & API (phác thảo)
- **Schema:**
  - `company_groups`: id, name, holding_company_id, owner_character_id, status, created_at, updated_at, meta.
  - `company_group_members`: id, group_id, company_id (unique khi active), role (`holding`|`subsidiary`|`affiliate`), control_snapshot_pct, joined_at, left_at/status.
  - (Tuỳ chọn) `company_group_events`: audit lịch sử (tạo/đổi tên/thêm/gỡ/giải tán).
- **API (phác thảo):**
  - `POST /api/v1/corporations/groups` (tạo), `GET /groups` (của tôi/liên quan), `GET /groups/:id`, `PATCH /groups/:id` (đổi tên/đổi holding nếu hợp lệ), `DELETE /groups/:id` (giải tán).
  - `POST /groups/:id/members` (thêm), `DELETE /groups/:id/members/:companyId` (gỡ).
  - `GET /groups/:id/overview` (báo cáo hợp nhất tổng hợp).
- **UI (đề xuất):** mục/tab **“Tập đoàn”** trong `Doanh nghiệp` (`apps/web-game/src/pages/BusinessPage.tsx`): danh sách nhóm, cây mẹ–con, % kiểm soát, dashboard tổng hợp, liên kết từng công ty.

---

## 4. Pha 2 – Mua lại toàn bộ (Buyout 100%) (chốt sau)

- **Mục tiêu:** đạt 100% sở hữu để đủ điều kiện sáp nhập.
- **Cơ chế gợi ý:** đề nghị mua lại (tender/buyout) cổ đông còn lại theo giá/điều kiện & thời hạn; thanh toán qua escrow/ledger; trạng thái “sẵn sàng sáp nhập” khi đạt 100%.
- **Cổ đông thiểu số:** tuỳ chọn **ép mua (squeeze-out)** khi đạt ngưỡng (vd ≥ 90–95%) với công thức bồi hoàn minh bạch.
- **Tái dùng:** `company_share_offerings`/giao dịch cổ phần, `stock_holdings`/lệnh thị trường (IPO), ledger/escrow.

## 5. Pha 3 – Sáp nhập công ty (Merger A→B) (chốt sau)

- **MVP sáp nhập đề xuất:** **A sáp nhập vào B (B là công ty sống)**; A do bên tiếp nhận nắm **100%**; cả hai `active`.
- **Xử lý chính (phác thảo):**
  - **Tiền/tài sản:** chuyển cash/số dư liên quan A → B qua ledger; cập nhật định giá theo công thức chốt trước.
  - **Cổ phần & thị trường:** nếu A niêm yết → hủy niêm yết, hủy/hoàn lệnh treo, xử lý `stock_holdings` (quy đổi hoặc đã buyout hết), xử lý dữ liệu thị trường.
  - **Nhân sự:** chuyển `employments`/`company_staff` (giữ lịch sử lương/nợ lương), hợp nhất vai trò chủ DN nếu trùng.
  - **Doanh thu & thuế:** **giữ lịch sử** `company_revenue_settlements` và `company_tax_filings` của A (chỉ đọc, gắn nhãn đã sáp nhập vào B); sau thời điểm sáp nhập không phát sinh kỳ mới cho A; kỳ/nợ thuế treo phải chốt/quyết toán hoặc chuyển trách nhiệm theo quy tắc.
  - **Giấy phép & trụ sở:** chuyển/giữ hoặc yêu cầu cấp/chọn lại nếu xung đột (`premises_*`, claim HQ).
  - **Trạng thái A:** `merged` + `merged_into_company_id`, `merged_at` (giữ truy vết, không xóa); ghi `company_mergers` + bút toán `merger`.
- **Rủi ro cần chốt:** công thức quy đổi giá/cổ phần, nợ & nghĩa vụ, lệnh/thị trường đang mở, kỳ thuế dở, trụ sở trùng, chống exploit né thuế/nợ.

---

## 6. Checklist chốt (điền/xác nhận)

> Đánh dấu `[x]` vào lựa chọn, hoặc ghi rõ phương án khác.

### 6.1 Phạm vi triển khai
- [ ] **Pha 1 – Tập đoàn MVP** theo đề xuất mặc định (mục 3) — *khuyến nghị bắt đầu*
- [ ] Chỉ thiết kế, chưa triển khai
- [x] Bao gồm cả thiết kế chi tiết Pha 2 (Buyout 100%)
- [x] Bao gồm cả thiết kế chi tiết Pha 3 (Sáp nhập A→B)

### 6.2 Mô hình tập đoàn (Pha 1)
- [x] **Mặc định:** có **công ty mẹ/holding**; chủ tập đoàn = nhân vật kiểm soát công ty mẹ; chỉ chủ tập đoàn quản trị nhóm
- [ ] Khác: nhóm theo nhân vật, không bắt buộc holding (mô tả: ____________________________)

### 6.3 Điều kiện thành viên & quyền (Pha 1)
- [x] **Mặc định:** ngưỡng kiểm soát **> 50%** (theo `company_shareholders`) để vào/ở trong nhóm
- [ ] Yêu cầu **100%** mới được vào nhóm
- [x] **Mặc định:** công ty `active`, không `bankrupt`; 1 công ty chỉ thuộc 1 tập đoàn; không vòng lặp
- [ ] Bổ sung điều kiện: ____________________________________________________________
- [x] **Mặc định:** quyền xem — chủ tập đoàn xem toàn bộ; chủ công ty thành viên xem công ty mình
- [ ] Khác: _____________________________________________________________________

### 6.4 Phạm vi MVP & gameplay (Pha 1)
- [x] **Mặc định:** chỉ quản trị & **báo cáo hợp nhất** (read-only), không gộp sổ cái/thuế/lương/tiền, **không** buff gameplay
- [ ] Muốn thêm lợi ích/buff ở MVP: ________________________________________________

### 6.5 Pha 2 & Pha 3 (chốt khi triển khai các pha sau)
- [ ] Buyout: cho phép **squeeze-out** khi ≥ ____% (công thức bồi hoàn: ____________)
- [x] Sáp nhập: chỉ **A → B (B sống)** / tạo pháp nhân mới: ________________________
- [ ] Sáp nhập yêu cầu **100%** sở hữu: Có / Không (ngưỡng: ____)
- [x] Xử lý IPO/ticker/`stock_holdings`/lệnh treo: _________________________________
- [x] Kỳ thuế/doanh thu treo & nợ: chốt trước / chuyển trách nhiệm / không cho sáp nhập khi còn nợ (chọn: ______)
- [x] Trụ sở/giấy phép khi trùng hoặc xung đột: ____________________________________

## 7. Ghi chú triển khai (khi bắt đầu code)
- Ưu tiên migration + API + UI theo Pha 1; kiểm tra điều kiện >50% từ dữ liệu cổ phần hiện có.
- Báo cáo hợp nhất tính từ nguồn hiện có (`companies`, `company_revenue_settlements`, thuế/giấy phép, nhân sự/payroll) — không thay đổi logic chốt kỳ/thuế/lương per-company.
- Cần rebuild/restart service & app liên quan và kiểm thử với dữ liệu có/không có IPO, nhiều cổ đông, công ty bankrupt.
