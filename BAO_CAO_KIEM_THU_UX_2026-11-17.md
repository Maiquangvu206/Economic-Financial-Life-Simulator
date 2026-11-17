# Báo cáo chạy thử và đánh giá UX — 17/11/2026

## Tóm tắt

Đã kiểm tra build, typecheck, test, lint và chạy lại backend qua Docker. Cả 7 container đều healthy; smoke test xác nhận 5 health endpoint và luồng đăng ký → đăng nhập → hồ sơ nhân vật thành công. Hai frontend trả về giao diện; form đăng ký đổi đúng khi bấm chuột.

| Hạng mục | Kết quả |
|---|---|
| `pnpm build` | **Đạt** — 9/9 tác vụ build thành công |
| `pnpm typecheck` | **Đạt** — mọi workspace có typecheck đều qua |
| `pnpm test` | **Không đạt** — domain 30/30 test qua; game-core integration bị lỗi fixture: social seed thiếu `characters.cccd` bắt buộc; ledger integration hard-code `localhost:55432` trong khi Docker publish PostgreSQL tại `localhost:5433` |
| `pnpm lint` | **Không đạt** — 666 vấn đề: 617 lỗi, 49 cảnh báo; phần lớn là `@typescript-eslint/no-explicit-any` |
| `pnpm ai:test` | **Đạt** — 6/6 test qua; có 3 warning về cấu hình pytest và Starlette TestClient |
| Docker Compose | **Đạt** — `postgres`, `redis`, `game-core`, `api-gateway`, `realtime`, `worker`, `ai` đều `healthy` |
| `pnpm smoke` | **Đạt** — 5 health endpoint và đăng ký → đăng nhập → `characters/me` thành công |

Smoke test đã tạo một tài khoản kiểm thử mới trong database cục bộ (`smoke_mwks540b`). Script không tự xóa tài khoản sau khi chạy.

Build có cảnh báo kích thước bundle: admin khoảng 608 kB, web-game khoảng 739 kB sau minify (chưa gzip). Web-game cũng báo chunk `charts` rỗng và import `httpClient.ts` vừa static vừa dynamic. Đây là cảnh báo tối ưu tải ban đầu, không làm build thất bại.

## Kiểm thử UX chuyên sâu

### Tái đánh giá sau các chỉnh sửa gần đây (17/11/2026)

| Hạng mục | Kết quả lần rà lại |
|---|---|
| `pnpm build` | **Đạt** — 9/9 workspace build; còn cảnh báo bundle >500 kB, web-game ~761 kB và admin ~605 kB sau minify |
| `pnpm typecheck` | **Đạt** — tất cả workspace có typecheck đều qua |
| Unit tests domain | **Đạt** — 30/30 |
| `pnpm test` | **Không đạt** — social integration 11 ca bị skip khi không có DB trong lần chạy tổng; ledger integration lỗi do cố định cổng 55432. Khi trỏ social test vào DB Docker cổng 5433: 8 fail, 3 pass do fixture ghi cột `users.is_active` không có trong schema; suite vẫn chạy test sau khi setup thất bại |
| `pnpm lint` | **Không đạt** — 629 lỗi, 50 cảnh báo (đa số `no-explicit-any`) |
| `pnpm ai:test` | **Chưa xác nhận** — tiến trình test không trả kết quả trong lần rà này và bị dừng; kết quả 6/6 pass là số liệu lần kiểm tra trước |
| Docker | **Đạt** — cả 7 container healthy |
| AI admin status | **Còn lỗi** — GET từ game-core tới `http://ai:8000/v1/ai-admin/status` vẫn trả **404** |

Các đề xuất trước đã được áp dụng một phần trong mã: effect tìm kiếm chat dùng `[search, searchUsers]` thay cho object hook, topbar có `ConnectionStatusBanner`, nút mở menu và notification đặt `min-width/height: 44px`, fixture social dùng ID theo run và cleanup theo fixture. Đây là xác nhận mã nguồn; phiên browser không cho phép hoàn tất kiểm tra UI tự động lần này nên chưa kết luận các lỗi chat/reconnect đã hết khi chạy thật.

Đã truy vấn số liệu tổng hợp trên DB hiện tại (không đọc dữ liệu cá nhân): 13 job đang mở, 51 vị trí, 3 công ty active, 12 trường, 5 welfare benefits; salary khởi điểm thấp nhất 210.000 ₫, tuition thấp nhất 0 ₫. Vì vậy nhận định cũ “toàn bộ tuyển dụng/doanh nghiệp/trường đều trống” **không còn đúng với DB hiện tại**. Tuy nhiên stock tickers = 0, elections = 0, properties = 0; các nhánh thị trường/chính trị/tài sản vẫn thiếu dữ liệu để E2E. Số liệu DB chưa thay thế việc xác nhận nội dung có hiển thị đúng trên player UI.

**Kết luận lại:** build/typecheck và domain pass; người chơi mới đã có nhiều việc làm/công ty/phúc lợi hơn theo DB hiện tại; vẫn chưa đạt mức “toàn bộ đề xuất đã xử lý” vì integration tests, lint và AI admin status còn lỗi. Đánh giá responsive 714×710 ở phần dưới là quan sát UI lần trước; kích thước nút 44 px lần này xác nhận từ class trong source.

### Bổ sung: ma trận nghiệp vụ và kiểm thử đa thiết bị (17/11/2026)

- Chạy lại `pnpm test`: **30/30 test domain qua** (construction 4, rules 20, province map 6). Hai integration suite game-core không chạy được trong môi trường lệnh hiện tại: kết nối DB trả `EACCES` tại `localhost:5433` và `localhost:55432`; tổng cộng 13 ca integration bị skip khi suite setup thất bại. Không coi các ca này là pass.
- Tránh chạy integration suite lên DB đang dùng chung: ledger fixture dùng UUID cố định và cleanup xóa theo `reference_type` `test_transfer`/`test_overdraft` trên toàn DB; social fixture cũng cần sửa cleanup để vẫn chạy khi seed lỗi. Đề xuất chuyển sang DB ephemeral. Ma trận đầy đủ theo nhóm nghiệp vụ và các nhánh chưa được xác nhận nằm trong file đề xuất riêng.
- Kiểm tra mã session cho thấy player và admin lưu access/refresh token trong `localStorage`; cùng trình duyệt có thể chia session giữa các tab, còn thiết bị khác có storage độc lập. Refresh token là JWT stateless, chưa thấy UI thu hồi từng thiết bị. Đây là rà soát mã nguồn, chưa phải thử nghiệm hai thiết bị thực.
- SSO handoff code giữ trong memory game-core, TTL 60 giây và dùng một lần; nhiều instance không chia sẻ store có thể làm luồng đổi mã khác instance thất bại. Presence cũng đếm socket trong memory mỗi realtime process. Đây là rủi ro khi scale, chưa tái hiện trên stack đơn máy.
- Chưa thực hiện E2E mutation cho vay/chuyển tiền, giao dịch tài sản, luật, chính trị, chợ đen hoặc quyền admin; các nhánh này được đánh dấu chưa xác nhận thay vì suy ra là đạt.

### Tài khoản và giới hạn tác động

- Đăng nhập bằng tài khoản smoke được tạo ở lượt kiểm tra trước (`smoke_mwks540b`, vốn ban đầu 500.000 ₫). Đăng nhập thành công, vào được game.
- Mật khẩu của tài khoản QA cũ trong báo cáo trước không đăng nhập được trên database hiện tại; tài khoản smoke mới hoạt động.
- Đăng nhập admin trực tiếp bằng tài khoản test được ghi trong `docs/roadmap.md` thành công. Kiểm tra trang SSO bằng liên kết nhưng **chưa chạy hết handoff một lần**.
- Không gửi chat, không ghi danh, không vay/chuyển tiền/mua cổ phiếu, không đặt giá đất, không tạo công ty, không phát thông báo, không sửa cấu hình admin, không thực hiện hành động ở chợ đen.
- Đã thử gửi tiết kiệm khi số tiền còn trống và với số tiền 500.001 ₫ (vượt tiền mặt 500.000 ₫). Cả hai lần đều bị chặn bằng thông báo dễ hiểu, số dư vẫn là 500.000 ₫ và tiết kiệm 0 ₫.
- Đã tạm tắt `Hiển thị tóm tắt khi tôi quay lại` trên tài khoản smoke để duyệt đủ route; sau đó khôi phục về bật như cài đặt ban đầu. Không thay đổi cấu hình hệ thống.

### Web-game: 13 route

| Khu vực | Kết quả quan sát |
|---|---|
| Thành phố | Bản đồ 50×38 tải đủ 1.900 ô; click ô thật mở panel tọa độ/quy hoạch/giá. Zoom 100% → 125%, lưới hoạt động. Chọn Cần Thơ đổi bản đồ đúng; bộ lọc Miền Nam cho 8 tỉnh, tìm “Cà Mau” trả đúng mã 096. Có phiên đấu giá Cần Thơ giá hiện tại 96.560.000 ₫; không đặt giá. |
| Nhân vật | CCCD, tên, quê quán, tài sản, tín dụng, heat và năng lượng có dữ liệu; form tài khoản/đổi mật khẩu hiển thị. Không sửa thông tin hoặc mật khẩu. |
| Giáo dục | 9 trường/ngành hiện ra; học phí thấp nhất 1.200.000 ₫/tháng, trong khi tài khoản mới có 500.000 ₫. Cả 9 nút “Ghi danh” vẫn bật; không ghi danh. |
| Tuyển dụng | 0 tin, 0 vị trí đang mở. Trang báo người chơi “đủ điều kiện ứng tuyển” nhưng không có tin nào để ứng tuyển. |
| Tài chính | Tiền mặt, tiết kiệm, nợ, tín dụng, hạn mức, chuyển khoản và lịch sử hiển thị. Hạn mức tối đa 349.091 ₫. Form gửi tiền trống/vượt số dư đều bị chặn. Các trường số tiền/CCCD/nội dung không liên kết với nhãn form qua `label`/ARIA. |
| Bất động sản | Tài sản sở hữu 0, không có tin bán, bảng thuê hay đấu giá phát mãi; empty state có hướng dẫn sang trang Thành phố. |
| Doanh nghiệp | Thị trường 0 công ty. Mở form thành lập cho thấy vốn mặc định 10.000.000 ₫ và yêu cầu địa điểm bắt buộc; danh sách địa điểm trống, nút “Thành lập” bị vô hiệu hóa. Tài khoản mới không có đất, không có địa điểm công ty dùng được. |
| Chứng khoán | Danh mục và lịch sử trống; bảng mã không có dòng cổ phiếu. Không có mã để thử thao tác mua/bán. |
| Pháp lý | Các tab vụ án, bằng chứng, gia đình/di chúc, thuế/giấy phép hiển thị; không có hồ sơ cá nhân ban đầu. |
| Chính trị | Chưa có bầu cử, ứng viên hay thị trưởng; có CTA tranh cử nhưng chưa có cuộc bầu cử. |
| Chợ đen | Các dịch vụ và mức rủi ro/phần thưởng hiện rõ; không thực hiện hành vi. |
| Mã quà tặng | Form nhập mã và lịch sử rỗng có thông báo rõ. Không thử mã để tránh ghi lịch sử/làm tăng rate-limit. |
| Khi vắng mặt | Cài đặt và recap có dữ liệu; mở trang sau một khoảng test ghi nhận 1–6 phút offline. |

### Admin: 17 route

- Đăng nhập trực tiếp thành công; dashboard, menu và vai trò admin hiển thị rõ.
- Các trang `/`, `/broadcast`, `/gift-codes`, `/calendar-seasons`, `/education-config`, `/politics`, `/interest-rates`, `/industry-revenue`, `/stock-market-control`, `/offline`, `/restriction`, `/audit-logs`, `/players`, `/map-editor`, `/ai-events`, `/ai-providers`, `/chat` đều mở được sau đăng nhập.
- `/audit-logs` hiện tải **36/36** bản ghi; lỗi kẹt loading ghi trong báo cáo cũ không tái hiện.
- `/map-editor` dùng `<select>` HTML chuẩn; đổi mã 092 bằng chọn bàn phím/automation tải được 1.900 ô, phiên bản v2. Không bấm “Lưu CSDL”.
- `/ai-providers` báo “Mất kết nối”/không tải trạng thái. Đối chiếu runtime cho thấy game-core gọi `http://ai:8000/v1/ai-admin/status` nhưng AI container hiện tại trả **404** cho endpoint đó; `/health` vẫn trả 200 và game-core gọi được AI. Đây là lỗi tích hợp trạng thái/phiên bản container, thông báo trên UI đang quy kết chung là lỗi kết nối.
- Dashboard hiện 2 người chơi, quỹ đất 0 ₫, cung tiền 0 ₫, vốn hóa 0 ₫, lạm phát 2,40%, CPI 100.0. Một số trang cấu hình thị trường/industry rỗng; cần seed nếu muốn demo có nội dung.
- Form đăng nhập admin không gắn nhãn hiển thị với input qua `<label>` hoặc ARIA; submit trống bật thông báo trình duyệt “Please fill out this field.”

### Lỗi console lặp liên tục

Trên các route game đã mở, console liên tục ghi `Maximum update depth exceeded` từ `ChatWidget`; route admin `/chat` cũng ghi cảnh báo tương tự từ `ChatPage`. Mã ở hai component đều có effect phụ thuộc `[search, chat]`, rồi gọi `setSearchResults([])` khi search trống. `chat` là giá trị trả về từ hook và có thể đổi tham chiếu sau mỗi render; hành vi này phù hợp với vòng cập nhật lặp đã quan sát. Chat, layout và các trang khác vẫn render, nhưng vòng lặp gây log dày, render liên tục và có thể làm giảm phản hồi.

### Khả năng hiển thị ở viewport nhỏ

Ở viewport game 714×710, chiều rộng tài liệu và body đều 714 px, không tràn ngang. Bản đồ bắt đầu ở nửa dưới màn hình và còn phải cuộn để xem hết nội dung; điều khiển zoom/lưới nổi trên bản đồ, còn panel đấu giá và danh sách tỉnh nằm phía dưới.

**Bổ sung responsive:** chụp lại recap và thành phố tại 714×710. Drawer menu mobile hoạt động theo layout; thanh trạng thái tự xếp thành hai hàng; thẻ số liệu thành 2 cột; bản đồ 50×38 co vừa khung rộng khoảng 668 px. Tuy nhiên nút mở menu đo 36×36 px, nút thông báo 41×34 px (nhỏ hơn mục tiêu vùng chạm 44×44 px); nút chat nổi che một phần nội dung ở góc dưới khi cuộn. Bản đồ đủ xem tổng quan nhưng mỗi ô nhỏ, thao tác chọn ô trên màn hình cảm ứng cần được kiểm tra kỹ.

Đây mới là kiểm tra trên viewport hẹp 714×710, chưa đo trực tiếp 360/390 px điện thoại, tablet ngang hay desktop lớn. Kết luận hiện tại: có breakpoint/layout responsive, nhưng chưa đủ bằng chứng để khẳng định UX tốt trên mọi cỡ điện thoại.

## Phạm vi UX đã quan sát

### Kiểm tra realtime riêng

- `http://localhost:5000/health` trả **200** (`status: ok`). Socket.IO polling handshake cũng trả **200**, cấp session và xác nhận server hỗ trợ nâng cấp sang WebSocket. Cấu hình server: ping mỗi 20 giây, timeout 25 giây, payload tối đa 64 KiB.
- Frontend player và admin đều dùng WebSocket-only, gửi access token trong handshake, tự reconnect nhưng giới hạn **10 lần**. Đăng nhập, phân quyền và quyền tham gia phòng được xử lý ở server; client game đăng ký nghe `notification`, `game:time`, chat và presence.
- Mã nguồn có luồng chat có ACK, giới hạn gửi 5 tin/3 giây/socket, lịch sử tải qua API; player cập nhật recap/HUD theo sự kiện `game:time`, còn thông báo realtime kích hoạt tải lại danh sách thông báo.
- **Chưa xác minh end-to-end có xác thực** (hai client cùng nhận chat/presence, thông báo admin tới player, mất mạng rồi khôi phục) trong lượt này: không có phiên frontend đang mở tại đúng origin 5173 để dùng lại, và không gửi chat/thông báo để tránh tạo nội dung lưu bền trong DB. Vì vậy kết quả health/handshake xác nhận socket server sống, nhưng không chứng minh toàn bộ luồng event đang tới UI.
- Điểm UX cần cải thiện: khi socket rớt, `ChatPage` có trạng thái “chưa kết nối” và có thể yêu cầu kết nối lại; HUD/thông báo/game clock không có chỉ báo mất kết nối tương đương. Sau khi hết 10 lần reconnect, người chơi có thể không biết dữ liệu realtime đã ngừng cập nhật.
- Rủi ro khi scale nhiều realtime instance: Redis adapter đồng bộ room/event, nhưng presence `onlineCounts` hiện lưu trong bộ nhớ từng process. Khi một user có socket ở nhiều instance, một instance có thể phát `offline` khi socket của nó đóng dù user vẫn online ở instance khác. Chưa tái hiện vì môi trường hiện tại chỉ được kiểm tra như một stack cục bộ.

### Web-game

- Trang đăng nhập player hiển thị cổng đăng nhập, mô tả trò chơi, thông báo hệ thống và hai nút **Đăng nhập / Tạo tài khoản**.
- Click chuột **Tạo tài khoản** đã mở form đăng ký ngay trong lần kiểm tra này. Báo cáo trước ghi nhận lỗi chỉ hoạt động bằng bàn phím, nhưng lỗi đó **không tái hiện**.
- Form đăng ký có trường tên công dân, họ tên nhân vật, nơi sinh, email và mật khẩu; danh sách nơi sinh hiển thị các tỉnh/thành.
- Backend Docker đang chạy healthy; đăng nhập bằng tài khoản smoke thành công. Chưa gửi form đăng ký mới.

### Admin

- Trang `http://localhost:5174/` tải được.
- Khi chưa đăng nhập, trang hiển thị rõ yêu cầu quyền quản trị và cung cấp liên kết đến cổng đăng nhập trực tiếp hoặc SSO. Đây là hành vi kiểm soát truy cập hợp lý.
- Đăng nhập trực tiếp bằng tài khoản test thành công; đã rà đủ 17 route quản trị (chi tiết ở phần trên).

## Nhận xét trải nghiệm và ưu tiên

1. **P1 — Vòng lặp render ChatWidget/ChatPage.** Cảnh báo `Maximum update depth exceeded` lặp qua nhiều route game và trang chat admin; đây là vấn đề toàn cục cần xử lý trước demo.
2. **P1 — Người chơi mới không có lối vào vòng lặp kinh tế.** Tài khoản có 500.000 ₫; mức ghi danh thấp nhất 1.200.000 ₫/tháng, hạn mức tín dụng 349.091 ₫, không có tin tuyển dụng, công ty hay cổ phiếu; thành lập công ty bị khóa vì không có địa điểm/đất, trong khi form yêu cầu vốn mặc định 10 triệu ₫. Cần seed nội dung/đường khởi đầu hoặc hướng dẫn một con đường khả thi không phụ thuộc hành vi phạm pháp.
3. **P1 — AI status trên admin hỏng ở runtime.** Endpoint được game-core gọi trả 404 dù AI health và mạng nội bộ đều tốt; rebuild/đồng bộ phiên bản hoặc sửa route, đồng thời làm thông báo UI phân biệt 404, 502 và mất mạng.
4. **P1 — Integration tests game-core chưa khớp schema/cổng.** Social fixture thiếu `characters.cccd` bắt buộc; ledger test hard-code `localhost:55432` trong khi Docker publish PostgreSQL ở `5433`.
5. **P2 — Nhãn biểu mẫu không truy cập được.** Đã xác nhận ở admin login và một số form tài chính; gắn `label`/`htmlFor` hoặc `aria-label`, đặc biệt với CCCD, số tiền, nội dung chuyển khoản.
6. **P2 — Các empty state tạo cảm giác hệ thống chưa được seed.** Tuyển dụng, doanh nghiệp, chứng khoán, bầu cử đều trống; các CTA xuất hiện nhưng không dẫn đến bước khởi đầu khả thi.
7. **P2 — Chất lượng lint đang thấp.** 617 lỗi và 49 cảnh báo, phần lớn là `no-explicit-any`; bundle entry admin ~608 kB và web-game ~739 kB sau minify.
8. **P3 — AI test warnings.** 6/6 test qua, nhưng pytest có 2 option asyncio không được nhận và Starlette cảnh báo về `httpx`.
9. **Đã cải thiện/không tái hiện:** nút “Tạo tài khoản” nhận click; Map Editor dùng select chuẩn; audit log tải 36/36.

## Giới hạn và cách đọc kết quả

- Đây là kiểm tra UX thủ công sâu trên dữ liệu phát triển hiện tại, không phải kiểm thử đầy đủ mọi nhánh nghiệp vụ.
- Các thao tác ghi tiền/tài sản, chat gửi đi, cấu hình admin và hành động chợ đen không được thực hiện; kết luận cho các luồng đó chỉ dựa trên UI/validation hiển thị.
- Smoke tạo tài khoản QA cục bộ `smoke_mwks540b`; account và recap setting mặc định đã được giữ/khôi phục, các lần chạy game tick/offline làm tăng thời gian trong game của account QA.
- Hai dev server frontend được khởi động riêng cho lần kiểm tra này; Docker stack là stack có sẵn của người dùng và vẫn được giữ nguyên.
