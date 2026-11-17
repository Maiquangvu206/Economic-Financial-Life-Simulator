# Đề xuất cải thiện UX responsive, nghiệp vụ và sử dụng trên nhiều thiết bị

**Ngày:** 17/11/2026  
**Nguồn:** rà soát UI 13 route game, 17 route admin; đọc API/service realtime/auth và chạy `pnpm test`.  
**Cách hiểu:** mục “đã quan sát” là hành vi thấy ở giao diện hoặc lệnh chạy; mục “cần xác minh” là nhận định từ mã nguồn, chưa tái hiện E2E.

## Ưu tiên thực hiện

### P0 — Làm cho bộ kiểm thử nghiệp vụ đáng tin cậy

1. **Tách integration tests khỏi DB đang dùng chung.** Tạo database/container ephemeral cho test; không cho test ledger xóa mọi giao dịch theo `reference_type` toàn DB. Dùng namespace ID theo lần chạy và cleanup chỉ theo ID của fixture.
2. **Sửa fixture social theo schema hiện tại.** Thêm các trường bắt buộc của `characters` (báo cáo trước đã thấy thiếu `cccd`) và bảo đảm `afterAll`/finally dọn dữ liệu ngay cả khi `beforeAll` seed thất bại.
3. **Chuẩn hóa cấu hình DB qua `DATABASE_URL`.** Xóa hard-code cổng 55432; kiểm tra health/connection trước khi chạy. Trong lượt kiểm tra này, 30 test domain qua, nhưng 13 integration test bị skip do môi trường test không kết nối được DB (`EACCES` tới 5433/55432), nên chưa xác nhận luồng đó.
4. **Thiết lập coverage theo nhánh nghiệp vụ.** Mỗi luồng mutation cần ca thành công, input biên, không đủ điều kiện/tiền, quyền sai, request lặp, rollback khi lỗi giữa chừng và kiểm tra số dư/trạng thái cuối.

### P1 — Gỡ các điểm chặn người chơi mới và lỗi realtime

1. **Tạo vòng khởi đầu kinh tế khả thi:** seed ít nhất một công việc hợp lệ hoặc trợ cấp/nhiệm vụ khởi đầu có hướng dẫn; cho biết điều kiện, chi phí và lợi ích trước khi bấm. Đảm bảo người chơi mới có lựa chọn phù hợp với 500.000 ₫ hiện thấy.
2. **Sửa vòng render của `ChatWidget` và `ChatPage`** đang phát `Maximum update depth exceeded` lặp trên nhiều route; sau sửa đo lại render và phản hồi UI.
3. **Thêm trạng thái kết nối chung cho player/admin.** Hiện chat có thể hiện chưa kết nối, còn đồng hồ game và thông báo không có chỉ báo tương ứng. Hiện banner “Đang kết nối lại / Mất kết nối / Đã đồng bộ”; sau khi hết retry cho nút kết nối lại.
4. **Đồng bộ presence liên instance.** Presence hiện đếm socket trong memory của từng process trong khi room/event có Redis adapter. Dùng Redis TTL/lease hoặc adapter presence để một tab đóng không làm người dùng hiện offline nếu thiết bị/tab khác còn hoạt động.
5. **Sửa tình trạng AI status.** Runtime trước trả 404 cho endpoint status mà game-core gọi dù health trả 200; đồng bộ image/route và hiển thị lỗi phân biệt 404, timeout, 5xx.

### P2 — Làm rõ giao dịch và tăng khả năng truy cập

1. **Gắn nhãn cho mọi input.** Dùng label liên kết hoặc accessible name; ưu tiên email/mật khẩu, CCCD người nhận, tiền gửi/rút/chuyển, nội dung, mã quà, giá đấu.
2. **Xác nhận trước mutation không thể đảo ngược.** Màn hình tóm tắt phí, số dư sau giao dịch, bên nhận, thời hạn/lãi suất, rủi ro và nút xác nhận cuối; hỗ trợ idempotency để bấm lặp không tạo giao dịch kép.
3. **Phân biệt empty state với lỗi tải.** Tuyển dụng, công ty, cổ phiếu, bầu cử trống phải ghi “chưa có dữ liệu/đợt tiếp theo” kèm điều kiện hoặc CTA có thể làm được; không hiển thị CTA hành động khi backend không có đối tượng để thao tác.
4. **Chuẩn hóa tiền tệ và đơn vị.** Hiển thị rõ VND, kỳ tính (mỗi tháng/mỗi kỳ), lãi suất, phí và làm tròn; so khớp cùng đơn vị ở form và API.
5. **Responsive theo tác vụ.** Với viewport 714×710 đã quan sát, bản đồ không tràn ngang nhưng chiếm nửa dưới và panel cần cuộn. Ưu tiên thanh tóm tắt cố định, bảng dạng card trên màn nhỏ, nút đủ lớn và không để modal bị bàn phím che.

## Đánh giá responsive giao diện (ý bạn hỏi)

### Đã quan sát trực tiếp ở 714×710

- **Đạt cơ bản:** không có tràn ngang (document width 714 px); menu thu gọn dạng drawer; thanh trạng thái xếp hai hàng; thẻ chỉ số xếp hai cột; bản đồ co vừa chiều ngang.
- **Cần cải thiện:** nút menu đo 36×36 px, thông báo 41×34 px; vùng chạm nên từ 44×44 px trở lên. Nút chat nổi che một phần nội dung góc dưới. Trên trang thành phố, bản đồ 50×38 vẫn xem tổng quan được nhưng từng ô nhỏ, khó chọn chính xác bằng ngón tay; zoom và lưới là nút nổi trên bản đồ.
- **Đánh giá tạm:** layout có breakpoint và dùng được ở cửa sổ hẹp; chưa đủ bằng chứng để kết luận tối ưu cho điện thoại dọc phổ biến.

### Cần xác minh thêm trước khi gọi là hỗ trợ điện thoại/tablet đầy đủ

- Chạy viewport 360×800, 390×844, 430×932, tablet 768×1024, tablet ngang 1024×768 và desktop 1440×900; kiểm tra finance, map, chat, modal, admin tables.
- Kiểm tra bàn phím ảo mở trên input: nút submit còn nhìn thấy và nội dung không bị che; xoay màn hình; safe-area iPhone; zoom trình duyệt 200%.
- Kiểm tra vùng chạm tối thiểu 44×44 px, chữ đọc được, focus/hover có phương án touch, scroll ngang chỉ nằm trong bảng có chủ đích.
- Chạm chọn ô bản đồ ở các góc, kéo/pan và pinch-zoom; không để thao tác kéo trang bị nhầm thành chọn đất hoặc ngược lại.
- Đánh giá portrait/landscape bằng thiết bị thật hoặc viewport emulator. Kiểm tra trực tiếp hiện mới chụp tại 714×710.

## Ma trận nhánh nghiệp vụ cần được khóa bằng kiểm thử

| Nhóm | Nhánh tối thiểu cần kiểm thử | Mức xác nhận hiện tại |
|---|---|---|
| Đăng ký/đăng nhập/refresh/đổi mật khẩu/SSO | email trùng, sai mật khẩu, token hết hạn, refresh lặp, handoff dùng một lần/hết hạn, tài khoản bị khóa | Đăng ký/login smoke trước đó; SSO và đa phiên chưa E2E; test suite không bao phủ đủ |
| Nhân vật/hồ sơ | sửa hợp lệ, dữ liệu sai, CCCD/account không tồn tại, quyền đọc nhân vật khác, người kế thừa | UI đã đọc; mutation chưa xác nhận |
| Giáo dục | đủ/thiếu tiền, đủ điều kiện, học phí từng kỳ, đăng ký trùng, nghỉ/hủy, tốt nghiệp | Đã thấy 9 lựa chọn và giá thấp nhất vượt tiền khởi đầu; không ghi danh |
| Tuyển dụng | danh sách rỗng, ứng tuyển hợp lệ/trùng/đã đóng, nhận/từ chối việc, lương và thôi việc | Đã thấy 0 việc; mutation chưa thử |
| Ngân hàng | gửi/rút, vay/đáo hạn/trả một phần/trả hết, chuyển đúng/sai người nhận, thiếu tiền, retry/idempotency, lịch sử hai bên | UI thử số tiền trống/vượt số dư; script smoke có mutation nhưng không chạy để tránh dữ liệu bền |
| Bất động sản/đất/đấu giá/xây dựng | đặt/mua/trả giá, giá sàn/tăng tối thiểu, hết hạn/thắng/thua, thiếu tiền, xây/hủy/xóa, tranh chấp | Đã xem map/auction và validation hiển thị; không đặt giá/mua/xây |
| Doanh nghiệp | thành lập vốn/địa điểm, thuê/mua địa điểm, tuyển dụng, doanh thu/chi phí, phá sản/chuyển nhượng | Thị trường rỗng và form thành lập bị khóa do thiếu site; chưa giao dịch |
| Chứng khoán | đặt/hủy lệnh mua/bán, khớp một phần/toàn phần, thiếu tiền/cổ phiếu, giờ đóng cửa, phí, portfolio realtime | Bảng mã rỗng; không có mã để giao dịch |
| Xã hội/thừa kế | đề nghị/chấp nhận/từ chối/hết hạn kết hôn/ly hôn, di chúc, quỹ ủy thác, điều kiện và chuyển tài sản thừa kế | Có 11 integration tests nhưng không thể chạy do DB bị sandbox chặn; chưa E2E |
| Pháp lý/thuế | đánh giá/nộp thuế, hạn nộp, báo cáo, giấy phép, vụ án/bằng chứng, quyền của các bên | Chỉ rà route/tab; không tạo hồ sơ hay nộp tiền |
| Chính trị/phúc lợi | tạo ứng cử, đủ điều kiện, bỏ phiếu một lần, kết thúc kỳ, trợ cấp đủ/đã nhận/hết hạn | Không có election ban đầu; không mutation |
| Chợ đen | từng dịch vụ thành công/thất bại, heat/risk, tiền phạt/tịch thu, cooldown, giới hạn tài khoản | Đã đọc mô tả/rủi ro; không chạy hành vi |
| Quà tặng/thông báo/offline | mã hợp lệ/sai/hết hạn/dùng lại, đọc một/mọi thông báo, offline cap, recap bật/tắt, tick qua nhiều phiên | UI và empty state đã xem; chưa redeem/đọc mutation |
| Admin | quyền theo role, CRUD/rollback, broadcast tới phiên đang mở, audit log và cập nhật client | 17 route mở được; đã xem audit/map editor, không lưu hay phát nội dung |

## Đánh giá phiên đăng nhập trên nhiều thiết bị

### Đã xác nhận từ mã nguồn

- Player lưu access token, refresh token và user trong `localStorage` dưới `efls.session`; admin lưu riêng `efls.admin.session`. Nhiều tab cùng origin trên **một trình duyệt/thiết bị** có thể đọc chung session. Thiết bị khác có storage riêng và phải đăng nhập hoặc dùng SSO handoff.
- Mỗi tab có thể tạo Socket.IO connection riêng; server đếm nhiều socket theo user trong cùng process. Chat riêng được phát cho room user/character để đồng bộ tab/thiết bị đã kết nối.
- Refresh token là JWT stateless; đăng nhập thiết bị mới không thay token cũ. Từ mã đã xem chưa thấy màn hình quản lý thiết bị, thu hồi từng phiên hoặc danh sách lần đăng nhập.
- Không thấy listener `storage`/`BroadcastChannel` để đồng bộ logout hoặc refresh session giữa các tab. Vì vậy tab đã mở có thể giữ session cũ trong memory sau khi tab khác đăng xuất; cần kiểm tra và đồng bộ trạng thái phiên liên tab.
- SSO handoff ticket được giữ trong memory của game-core và chỉ dùng một lần/60 giây. Nếu deployment chạy nhiều game-core instance không có sticky routing/shared store, tạo handoff ở instance A rồi đổi mã ở instance B có thể thất bại.
- Access/refresh token trong localStorage có thể bị đọc nếu có XSS. Cân nhắc cookie `HttpOnly`, `Secure`, `SameSite` cho refresh/session, hoặc giảm quyền và TTL của token lưu trong JS; đây là khuyến nghị kiến trúc, chưa phải khai thác đã tái hiện.

### Kịch bản cần chạy trên hai thiết bị thật

1. Đăng nhập cùng tài khoản ở desktop và điện thoại; xác minh hai nơi vẫn dùng được khi refresh token ở một nơi được làm mới.
2. Mở hai tab trên cùng thiết bị, gửi chat/nhận notification, đóng một tab; presence chỉ chuyển offline sau khi socket cuối cùng đóng.
3. Tắt mạng 30–60 giây rồi bật lại; đo thời gian reconnect, event bị lỡ có được tải bù qua API, đồng hồ và số dư có khớp sau reconnect không.
4. Đổi mật khẩu hoặc admin khóa tài khoản ở thiết bị A; xác minh thiết bị B bị yêu cầu đăng nhập lại và realtime bị ngắt đúng lúc.
5. Dùng SSO portal → admin trên cùng và khác phiên bản/instance; thử mã handoff dùng lại và hết hạn để thông điệp lỗi dễ hiểu.
6. Trên mobile, khóa màn hình/chuyển app, đổi Wi‑Fi sang 4G; kiểm tra socket phục hồi, không tạo thông báo/chat lặp và không giữ trạng thái “online” giả.
7. Khi reconnect, tải bù lịch sử chat/notification và làm mới số dư/trạng thái từ API; sự kiện realtime có thể bị mất trong lúc socket offline.

## Tiêu chí hoàn thành đề xuất

- Mỗi nhóm mutation có ca success + validation/error + permission + retry/idempotency + assertion trạng thái cuối.
- Test integration chạy trong CI với DB sạch; fixture tự cleanup cả khi setup lỗi; coverage report nêu rõ module/nhánh chưa được kiểm tra.
- Có E2E desktop và mobile, hai client đồng thời; realtime có độ trễ mục tiêu và xác nhận không mất dữ liệu sau reconnect.
- UX review chạy với keyboard-only, screen reader labels, viewport 360×800 / 390×844 / 768×1024 và desktop.
- Các giao dịch dùng tiền/tài sản chỉ chạy trên fixtures có thể reset; không dùng tài khoản/DB người chơi thật.

## Đối chiếu sau khi bạn áp dụng các đề xuất

Đã xác nhận bằng mã nguồn hoặc lệnh kiểm tra ngày 17/11/2026:

- Chat search effect đã dùng callback ổn định `searchUsers`; menu và nút thông báo có vùng chạm tối thiểu 44×44 px; player có `ConnectionStatusBanner` với reconnect, failed state và invalidate dữ liệu sau reconnect.
- Social fixture đã chuyển sang ID theo từng run và cleanup theo fixture, nhưng seed vẫn lệch schema (`users.is_active` không tồn tại); khi setup thất bại suite báo skip nhưng vẫn thực thi các ca và làm 8/11 ca fail.
- Build 9/9 và typecheck qua; unit tests domain 30/30 qua. Docker 7/7 container healthy.
- Các mục chưa xử lý/đạt: lint 629 lỗi/50 cảnh báo; ledger integration vẫn cố định `localhost:55432`; AI admin status runtime vẫn 404.
- Dữ liệu phát triển hiện có 13 job mở/51 vị trí, 3 công ty active, 12 trường và 5 welfare benefits; không còn empty trên tuyển dụng/doanh nghiệp/trường như lần trước. Stock tickers, elections và properties vẫn 0 trong DB đang chạy.

Đây là đánh giá chéo sau chỉnh sửa, không phải xác nhận mọi luồng giao dịch đã E2E. Cần rerun integration suite sau khi fixture được đồng bộ và sử dụng DB test cô lập; thử trên điện thoại 360–430 px thật hoặc emulator vẫn chưa hoàn tất.
