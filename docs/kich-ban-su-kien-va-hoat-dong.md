# Kịch bản sự kiện & hoạt động (bám thời gian hệ thống EFLS)

> **Mục tiêu:** tạo nhịp chơi bớt nhàm bằng sự kiện có lựa chọn, hậu quả rõ, chuỗi nhiều ngày, và cơ hội/thách thức gắn với kinh tế – đời sống – quan hệ.  
> **Quy ước thời gian:** 1 tick = 1 ngày game = 1 phút thực; 1 tháng = 30 ngày; 1 năm = 360 ngày (12×30). Trong 1 ngày game có 24h (1440 phút game, `hour/minuteOfDay`) và 4 buổi (rạng sáng 04–06, ban ngày 06–17, hoàng hôn 17–19, ban đêm 19–04). Kỳ tháng = `YYYY-MM`.  
> **Quy ước hậu quả (gợi ý triển khai):** `money` (₫), `health_energy` (± điểm, 0–100), `reputation`/uy tín, `heat`, `credit_score`, `relationship` (gia đình/đối tác/NPC), `skill_xp`, `stress/mood` (nếu có), vật phẩm/quyền lợi tạm thời, mở/khóa hoạt động. Mọi giá trị dưới đây là **gợi ý cân bằng** để tinh chỉnh khi implement.

---

## 1. Nguyên tắc thiết kế kịch bản

- **Luôn có lựa chọn có ý nghĩa:** ít nhất 2–3 nhánh; mỗi nhánh đánh đổi rõ (tiền ↔ sức khỏe ↔ thời gian ↔ rủi ro ↔ danh tiếng).
- **Tôn trọng thời gian hệ thống:** sự kiện ngắn xử lý trong ngày; sự kiện chuỗi span nhiều ngày/tick; sự kiện chu kỳ theo tháng/mùa/năm.
- **Hậu quả dây chuyền:** quyết định hôm nay có thể mở/khóa sự kiện tiếp theo (flag/state), ảnh hưởng kinh tế & đời sống sau đó.
- **Xác suất & điều kiện:** trigger theo ngữ cảnh (nghề, tiền, nơi ở, mùa, giờ, trạng thái gia đình, nợ, heat, sức khỏe) để không lặp cảm giác vô hồn.
- **An toàn trải nghiệm:** rủi ro cao có cảnh báo/giới hạn (ngày/tháng), không khóa chết người chơi; offline vẫn an toàn (không trừ thể lực ngoài cơ chế đã định).

### Cấu trúc dữ liệu gợi ý cho mỗi sự kiện
```yaml
id: EVT-XXXX
name: "Tên"
type: daily|chain|seasonal|monthly|milestone|opportunity
trigger:
  chance: 0.0-1.0            # mỗi lần kiểm tra
  when: day_start|action|tick_end|month_start|month_end|season_start
  time_of_day: [day|evening|night|dawn]|any
  season: [spring,summer,autumn,winter]|any
  conditions:                # ví dụ: employed, has_home, cash>=X, health<=Y, has_child, heat>=Z
duration: instant|same_day|N_days
cooldown_days: N
choices:
  - id: A
    label: "..."
    cost: {money, health_energy, time_minutes}
    requirements: {...}
    outcomes:
      immediate: {...}
      delayed: {after_days, effects, unlock_event}
      chance_outcomes: [{p, effects}]
followups: [event_ids]
```

---

## 2. Sự kiện ngẫu nhiên hằng ngày (Daily Storylets)

> **Tần suất gợi ý:** 40–60% ngày game có 0–1 sự kiện (tối đa 1 popup/ngày, ưu tiên theo ngữ cảnh). Cooldown theo `id` 7–30 ngày. Kiểm tra đầu ngày (sau tick) hoặc khi người chơi hoạt động.

### D-01. Chiếc ví trên vỉa hè
- **Trigger:** ban ngày/hoàng hôn, 5%/ngày, không cần điều kiện.
- **Bối cảnh:** Bạn thấy một chiếc ví rơi trên đường.
- **Lựa chọn:**
  - **A. Tìm cách trả lại:** tốn 30 phút game → `+reputation` nhỏ, `+mood`; 30% nhận thưởng cảm ơn `+50.000–150.000₫`; mở cơ hội quen biết (flag `contact_kind_stranger`).
  - **B. Giữ lại tiền:** `+100.000–400.000₫` ngay, `-reputation` nhẹ, `+heat` rất nhẹ; 10% bị phát hiện sự cố sau 1–3 ngày (mất uy tín/tiền phạt nhỏ).
  - **C. Bỏ qua:** không đổi, không rủi ro.
- **Hậu quả dây chuyền:** A có thể mở D-12 (lời giới thiệu việc/gig) trong 3–10 ngày.

### D-02. Xe/thiết bị hỏng giữa ngày
- **Trigger:** 4%/ngày nếu có phương tiện/tài sản sử dụng; sáng/chiều.
- **Bối cảnh:** Phương tiện hoặc thiết bị cá nhân hỏng bất ngờ.
- **Lựa chọn:**
  - **A. Sửa ngay tại chỗ:** `-150.000–600.000₫`, `-30–60 phút game`, hết gián đoạn.
  - **B. Sửa tạm rẻ:** `-50.000–150.000₫`, 20% tái hỏng trong 1–5 ngày (tốn nhiều hơn).
  - **C. Trì hoãn:** tiết kiệm tiền nhưng `-năng suất/thu nhập ca` hôm đó hoặc bỏ lỡ 1 hoạt động; rủi ro hỏng nặng sau 3–7 ngày.

### D-03. Cơn đau/ốm nhẹ
- **Trigger:** 6%/ngày nếu `health_energy < 40`, hoặc 2% nếu khỏe; tăng nhẹ mùa đông/hè khắc nghiệt.
- **Bối cảnh:** Bạn thấy mệt uể oải, dấu hiệu ốm nhẹ.
- **Lựa chọn:**
  - **A. Nghỉ ngơi & tự chăm:** `-60–120 phút game`, `+5 health_energy`, không tốn tiền (nếu có nơi ở hiệu quả hơn).
  - **B. Mua thuốc/khám nhanh:** `-80.000–200.000₫`, `+8 health_energy`, giảm xác suất nặng lên.
  - **C. Cố làm tiếp:** giữ thời gian/thu nhập hôm nay, `-5 health_energy`; 25% chuyển D-03B (ốm nặng 1–2 ngày, tốn tiền & nghỉ).

### D-04. Đồng nghiệp/người quen nhờ vay gấp
- **Trigger:** 3%/ngày nếu `employed` hoặc `reputation` trung bình+, ban ngày.
- **Bối cảnh:** Một người quen nhờ vay tạm một khoản nhỏ.
- **Lựa chọn:**
  - **A. Cho vay:** `-300.000–1.000.000₫`; 70% được trả sau 3–10 ngày + `+reputation`; 20% trả chậm (10–20 ngày); 10% mất (mất tiền, `-mood`, bài học).
  - **B. Từ chối khéo:** không mất tiền, `reputation` không đổi hoặc giảm rất nhẹ.
  - **C. Cho ít hơn/đặt điều kiện:** `-100.000–300.000₫`, rủi ro thấp hơn, `+reputation` nhẹ.

### D-05. Mời ăn/tụ họp bất ngờ
- **Trigger:** 4%/ngày, hoàng hôn/ban đêm, cao hơn nếu `relationship` tốt.
- **Bối cảnh:** Bạn bè rủ đi ăn uống/tụ họp tối nay.
- **Lựa chọn:**
  - **A. Đi cùng:** `-100.000–300.000₫`, `-90–150 phút game`, `+8–12 health_energy` (tinh thần), `+relationship/reputation`.
  - **B. Đi nhưng tiết kiệm:** `-40.000–80.000₫`, `+5 health_energy`, `+relationship` nhẹ.
  - **C. Từ chối ở nhà nghỉ:** `0₫`, `+relationship` giảm nhẹ, có thời gian nghỉ/làm việc khác.

### D-06. Hàng giảm giá chớp nhoáng
- **Trigger:** 5%/ngày, ban ngày; tăng khi mùa lễ hội/cao điểm.
- **Bối cảnh:** Một cửa hàng giảm giá sâu trong thời gian ngắn (trong ngày).
- **Lựa chọn:**
  - **A. Mua nhu yếu phẩm cần dùng:** `-50.000–200.000₫`, tiết kiệm chi phí sinh hoạt tương đương trong 3–7 ngày tới (buff giảm chi tiêu nhỏ).
  - **B. Mua món không cần thiết:** `-100.000–500.000₫`, `+mood` ngắn hạn, không lợi ích kinh tế.
  - **C. Bỏ qua:** giữ tiền.

### D-07. Được khen/thưởng nóng
- **Trigger:** 3%/ngày nếu `employed` và năng suất/đi làm ổn định trong 7 ngày gần nhất.
- **Bối cảnh:** Quản lý ghi nhận nỗ lực của bạn.
- **Lựa chọn:**
  - **A. Nhận thưởng & cảm ơn:** `+200.000–800.000₫` hoặc quà, `+reputation` nghề nghiệp.
  - **B. Xin cơ hội tốt hơn (ca/đào tạo):** 50% mở cơ hội OT/đào tạo trong 5–15 ngày; 50% chỉ nhận lời hứa (`+mood`).
  - **C. Khiêm tốn, không yêu cầu thêm:** `+reputation` nhẹ, ổn định quan hệ.

### D-08. Kiểm tra/soát vé bất ngờ (nhỏ)
- **Trigger:** 2%/ngày khi di chuyển/hoạt động ngoài trời, ban ngày.
- **Bối cảnh:** Bạn bị kiểm tra giấy tờ/vé/phiếu (ngữ cảnh trung tính).
- **Lựa chọn:**
  - **A. Xuất trình đầy đủ (nếu có):** `-10–20 phút game`, không sao.
  - **B. Chưa chuẩn bị:** `-50.000–200.000₫` phí xử lý hoặc `-30–60 phút game`; nhắc nhở chuẩn bị giấy tờ.
  - **C. Tranh cãi:** `-reputation` nhẹ, tốn thêm thời gian; `+heat` rất nhẹ.

### D-09. Tin đồn thị trường trong ngày
- **Trigger:** 4%/ngày nếu có tài sản/cổ phiếu/công ty hoặc quan tâm đầu tư.
- **Bối cảnh:** Bạn nghe tin đồn về giá/nhu cầu một mặt hàng hoặc ngành.
- **Lựa chọn:**
  - **A. Kiểm chứng rồi hành động:** `-30 phút game`; 60% thông tin đúng (mở cơ hội mua/bán có lợi nhỏ trong 1–3 ngày), 40% sai (không lỗ nếu thận trọng).
  - **B. Lao theo ngay:** 40% lời `+3–8%` khoản nhỏ, 60% lỗ `-3–8%`.
  - **C. Phớt lờ:** an toàn.

### D-10. Giúp đỡ hàng xóm/người lạ
- **Trigger:** 3%/ngày, sáng/chiều.
- **Bối cảnh:** Ai đó cần giúp việc nhỏ (khiêng đồ, chỉ đường, trông hộ).
- **Lựa chọn:**
  - **A. Giúp nhiệt tình:** `-30–60 phút game`, `-2 health_energy`, `+reputation`, 25% nhận quà/tiền tip `+30.000–100.000₫`.
  - **B. Giúp nhanh:** `-15 phút`, `+reputation` nhẹ.
  - **C. Từ chối:** không mất thời gian.

### D-11. Cơn mưa/bất tiện thời tiết (theo mùa)
- **Trigger:** 6%/ngày mùa mưa/khắc nghiệt (theo `season` cấu hình), 2% mùa thuận; ban ngày.
- **Bối cảnh:** Thời tiết xấu làm gián đoạn kế hoạch.
- **Lựa chọn:**
  - **A. Mua áo mưa/đi phương tiện phù hợp:** `-20.000–80.000₫`, đi tiếp.
  - **B. Chờ tạnh:** `-60–120 phút game`, lỡ 1 hoạt động ngắn.
  - **C. Đi bất chấp:** 30% bị ướt/mệt `-3 health_energy`, tiết kiệm tiền.

### D-12. Lời giới thiệu cơ hội (follow-up)
- **Trigger:** follow-up của D-01(A) hoặc khi `reputation` cao; 30% trong cửa sổ 3–10 ngày.
- **Bối cảnh:** Người bạn từng giúp liên hệ giới thiệu một gig/ca làm ngắn.
- **Lựa chọn:**
  - **A. Nhận lời:** mở gig trả `+300.000–1.200.000₫` trong 1–2 ngày (tốn thời gian & thể lực).
  - **B. Từ chối lịch sự:** `+reputation` giữ nguyên, có thể xuất hiện lại sau.
  - **C. Giới thiệu người khác:** `+reputation`, `+relationship` mạng lưới.

---

## 3. Chuỗi sự kiện nhiều ngày (Event Chains / Arcs)

> **Nguyên tắc:** mỗi arc có trạng thái (stage, deadline, flags). Mỗi ngày/tick chỉ tiến triển khi điều kiện thỏa; bỏ lỡ deadline có kết quả mặc định (thường bất lợi nhẹ).

### ARC-01. Đơn hàng freelance gấp (3 ngày)
- **Trigger:** 3%/ngày nếu không quá bận, hoặc sau D-12; ban ngày.
- **Stage 1 – Ngày 1 (nhận việc):**
  - Bối cảnh: Khách cần một việc gấp trong 3 ngày, trả `2.000.000₫`.
  - A. Nhận (cam kết): đặt `deadline = +3 ngày`, nhận cọc `400.000₫`.
  - B. Thương lượng: 50% được `2.400.000₫` nhưng deadline +0 (áp lực), 50% khách từ chối.
  - C. Từ chối: kết thúc.
- **Stage 2 – Ngày 2 (giữa chừng):**
  - Bối cảnh: Khối lượng nhiều hơn dự kiến.
  - A. Tăng ca hoàn thành đúng: `-10 health_energy`, `-180 phút game/ngày`.
  - B. Làm vừa phải: rủi ro trễ 40% ở Stage 3.
  - C. Nhờ hỗ trợ (thuê ngoài): `-400.000₫`, giảm mệt, đảm bảo tiến độ.
- **Stage 3 – Ngày 3 (bàn giao):**
  - A (đúng hạn, chất lượng): nhận còn lại `1.600.000₫`, `+reputation`, 30% mở hợp đồng dài hạn (ARC-01B sau 7–14 ngày).
  - B (trễ hạn): nhận `1.000.000₫`, `-reputation` nhẹ.
  - C (bỏ dở/quá hạn): mất cọc phần thưởng, trả lại cọc? (tùy): `-reputation`, `-mood`.
- **Nhánh ARC-01B – Hợp đồng lặp lại (hàng tháng):** mỗi tháng game 1 đơn nhỏ ổn định nếu giữ uy tín, hủy khi trễ 2 lần.

### ARC-02. Căng thẳng công việc & cảnh báo (5 ngày)
- **Trigger:** nếu làm OT/làm việc liên tục nhiều ngày & `health_energy < 35`; 5% khi đủ điều kiện.
- **Stage 1:** Dấu hiệu kiệt sức (cảnh báo). A. Giảm tải/nghỉ → `-thu nhập ngắn hạn`, `+health`. B. Cố gắng → tiếp tục.
- **Stage 2–3:** Hiệu suất giảm, rủi ro sai sót. A. Xin hỗ trợ/đổi ca. B. Tự gồng.
- **Stage 4:** Sự cố nhỏ (lỗi, trễ, phàn nàn khách) nếu vẫn gồng: `-reputation`, có thể `-tiền phạt`.
- **Stage 5 (kết):** A. Phục hồi (nghỉ + chăm sóc) → ổn định. B. Bỏ bê → `-health` lớn, nguy cơ nghỉ 1–2 ngày (mất thu nhập) hoặc ảnh hưởng đánh giá cuối tháng.
- **Mục tiêu thiết kế:** dạy nhịp nghỉ–làm, liên kết hệ thể lực & thu nhập.

### ARC-03. Cơ hội mua hàng giá hời (4 ngày)
- **Trigger:** 2%/tháng hoặc khi mùa cao điểm mua sắm; ban ngày.
- **Stage 1:** Nghe chào bán lô hàng/thiết bị giá tốt, cần đặt cọc trong 1 ngày.
- **Stage 2:** Kiểm tra chất lượng/nguồn (tốn thời gian) hay chốt nhanh.
- **Stage 3:** Giao dịch: hàng tốt (lời khi dùng/bán lại sau 5–15 ngày) hoặc hàng kém (mất một phần tiền, học bài).
- **Stage 4:** Thanh lý/lợi dụng giá trị: bán lại `+5–15%` hoặc dùng để giảm chi phí hoạt động 1 tháng.
- **Rủi ro:** nếu chọn vội + giá quá hời → 30% lừa đảo nhẹ (mất cọc).

### ARC-04. Hàng xóm gây phiền & hòa giải (3–7 ngày, linh hoạt)
- **Trigger:** 2%/tháng nếu có nơi ở ổn định.
- **Tiến triển:** vấn đề tiếng ồn/chung → lựa chọn nói chuyện trực tiếp, nhờ quản lý/hòa giải, hoặc bỏ qua.
- **Kết quả:** hòa giải tốt (`+relationship`, giảm stress), leo thang (`-mood`, tốn thời gian/tiền), hoặc bỏ qua (xác suất tái diễn).
- **Liên kết:** nơi ở & chất lượng sống.

### ARC-05. Kế hoạch tiết kiệm mục tiêu (30 ngày / 1 tháng game)
- **Trigger:** người chơi nhận nhiệm vụ/thử thách tháng hoặc tự đặt mục tiêu (vd tiết kiệm `5.000.000₫`).
- **Theo dõi:** mỗi 5 ngày (ngày 5,10,15,20,25,30) nhắc tiến độ; sự kiện “cám dỗ chi tiêu” xen kẽ (mua sắm, tụ tập) kiểm tra kỷ luật.
- **Kết (ngày 30/cuối tháng):** đạt mục tiêu → thưởng `+200.000–500.000₫` hoặc `+credit_score/reputation` nhỏ + huy hiệu; không đạt → không phạt nặng, gợi ý kế hoạch mới.
- **Mục tiêu thiết kế:** tạo mục tiêu dài hơi trong chu kỳ tháng (khớp stamina/tháng & kỳ tài chính).

---

## 4. Sự kiện theo mùa & thời điểm trong năm

> Gắn với `season`, `seasonEffects`, và lịch tháng (1–12). Tần suất: 1–2 sự kiện nổi bật/mùa/người chơi + biến thể nhỏ.

### S-Spring (Xuân, ví dụ tháng 2–4)
- **S-01 Tết/Lễ đầu năm (ngày cố định hoặc đầu mùa):** chi phí lễ (`-200.000–1.000.000₫`) đổi `+mood`, `+relationship`; cơ hội lì xì/thưởng/phúc lợi (`+100.000–2.000.000₫` tùy điều kiện). Lựa chọn: về quê/sum họp (tốn thời gian 1–2 ngày, hồi tinh thần) hoặc ở lại làm thêm (thu nhập, ít gắn kết).
- **S-02 Dọn dẹp & khởi đầu:** hoạt động 60–120 phút, `+mood`, cơ hội bán đồ cũ `+50.000–300.000₫`.
- **S-03 Cơ hội việc làm sau kỳ nghỉ:** thị trường việc/gig tăng nhẹ trong 5–10 ngày đầu mùa.

### S-Summer (Hạ, ví dụ tháng 5–7)
- **S-04 Nắng nóng kéo dài (cửa sổ 3–7 ngày):** nếu không có giải pháp mát/chăm sóc, `-health_energy` nhẹ mỗi ngày hoặc tăng chi phí điện/nước; lựa chọn mua quạt/giải pháp (`-tiền`) hoặc chịu đựng.
- **S-05 Cao điểm du lịch:** giá vé/lưu trú tăng (gắn `travel`), nhưng cơ hội kinh doanh/dịch vụ/cho thuê tăng; sự kiện “khách đặt gấp” cho người có BĐS/dịch vụ.
- **S-06 Lễ hội mùa hè:** tham gia tốn tiền & thời gian, `+health_energy/mood`, cơ hội gặp gỡ/quan hệ.
- **S-07 Rủi ro say nắng/kiệt sức:** trigger nếu hoạt động ngoài trời nhiều & thể lực thấp → chọn nghỉ/điều chỉnh.

### S-Autumn (Thu, ví dụ tháng 8–10)
- **S-08 Mùa thuận kinh doanh:** buff cơ hội doanh thu/bán hàng trong 10–15 ngày (một lần/mùa), sự kiện “đơn hàng lớn”.
- **S-09 Khóa học/khai giảng:** giảm giá đào tạo hoặc cơ hội đăng ký kỹ năng; lựa chọn đầu tư thời gian/tiền.
- **S-10 Bão/mưa kéo dài (vài ngày):** gián đoạn di chuyển/giao hàng, rủi ro hư hại nhỏ; lựa chọn phòng ngừa tốn tiền hay chấp nhận rủi ro.

### S-Winter (Đông, ví dụ tháng 11–1)
- **S-11 Lạnh giá & chi phí sưởi ấm:** tăng chi phí sinh hoạt trong tháng; lựa chọn gói tiết kiệm hay thoải mái (`health/mood`).
- **S-12 Mùa cảm cúm:** xác suất ốm tăng (liên kết D-03), khám/thuốc đắt hơn nhẹ; khuyến khích phòng ngừa.
- **S-13 Tổng kết cuối năm (tháng 12 hoặc cuối năm game):** sự kiện recap + thưởng/thách thức (đạt mục tiêu năm → thưởng, nợ/thuế tồn → nhắc nhở), lựa chọn kế hoạch năm mới.
- **S-14 Nhu cầu quà/tăng chi tiêu lễ:** cơ hội bán hàng/dịch vụ tăng nhưng chi tiêu cá nhân cũng tăng.

---

## 5. Sự kiện theo chu kỳ tháng & kinh tế vĩ mô

> Đồng bộ với kỳ `YYYY-MM`, lương, thuế, tiết kiệm, hao thể lực tháng, báo cáo.

### M-01. Ngày chốt lương/kỳ thu nhập (đầu/cuối kỳ tháng, theo hệ thống lương)
- **Bối cảnh:** Nhận lương/thu nhập kỳ.
- **Sự kiện kèm:** biến thể thưởng nhỏ, khấu trừ, hoặc thông báo chậm (hiếm) → lựa chọn phản ứng (lên kế hoạch chi tiêu, khiếu nại lịch sự, dự phòng).

### M-02. Hóa đơn & chi phí cố định (giữa tháng)
- **Bối cảnh:** Tiền thuê, điện nước, phí dịch vụ đến hạn.
- **Lựa chọn:** trả đúng hạn (`-tiền`, giữ uy tín/không phạt), trả trễ (phạt/giảm uy tín), hoặc cắt giảm gói (tiết kiệm nhưng giảm tiện ích/buff).

### M-03. Biến động giá/ngành (tin tức tháng)
- **Trigger:** đầu tháng, 1 “bản tin”/tháng.
- **Ví dụ biến thể:**
  - Ngành A tăng nhu cầu 10–20% trong tháng → gig/đơn hàng & lương OT ngành A tăng.
  - Giá nguyên liệu/thực phẩm tăng → chi phí sinh hoạt & sản xuất tăng.
  - Lãi suất/tín dụng điều chỉnh → ảnh hưởng vay/tiết kiệm.
- **Lựa chọn người chơi:** điều chỉnh kế hoạch (đổi gig, tích trữ hợp lý, hoãn đầu tư) — không bắt buộc nhưng có lợi nếu phản ứng.

### M-04. Báo cáo tài chính cá nhân (cuối tháng, ngày 28–30)
- **Bối cảnh:** Tóm tắt thu–chi–tiết kiệm–nợ trong tháng.
- **Kết quả:** nếu dư dương & đạt mục tiêu → thưởng nhỏ/huy hiệu; nếu âm → gợi ý hành động (gig, cắt chi, vay thận trọng). Liên kết ARC-05.

### M-05. Cơ hội đầu tư/thầu trong tháng (cửa sổ 3–5 ngày)
- **Bối cảnh:** Gói đầu tư, lô hàng, hoặc hợp đồng ngắn hạn mở đăng ký trong tháng.
- **Lựa chọn:** tham gia (cần vốn/điều kiện), bỏ lỡ, hoặc tham gia nhỏ (giảm rủi ro). Kết quả trả về cuối tháng hoặc sau N ngày.

### M-06. Kiểm tra tuân thủ/thuế định kỳ (theo cấu hình, vd vài tháng/lần)
- **Bối cảnh:** Nhắc kê khai, quyết toán, hoặc kiểm tra ngẫu nhiên.
- **Lựa chọn:** chuẩn bị trung thực (tốn thời gian/phí nhỏ), trì hoãn (rủi ro phạt), hoặc tối ưu hợp pháp (cần hiểu biết/kỹ năng) — hậu quả tiền & uy tín.

---

## 6. Sự kiện kinh tế – cơ hội & khủng hoảng

### E-01. Khách hàng trả trễ / nợ đọng
- **Trigger:** sau khi hoàn thành gig/hợp đồng hoặc cho thuê; 10–20% giao dịch rủi ro.
- **Lựa chọn:** nhắc nhở (miễn phí, chậm), gia hạn có phí, nhờ trung gian/biện pháp mạnh (tốn thời gian/tiền, `±reputation/heat`), chấp nhận mất một phần.
- **Thời gian:** hẹn trả sau 3–10 ngày; quá hạn lặp nhắc.

### E-02. Cơ hội hợp tác kinh doanh
- **Trigger:** khi có công ty/uy tín/tài sản đạt ngưỡng; 1–2 lần/mùa.
- **Lựa chọn:** góp vốn/nhận cổ phần nhỏ, ký hợp đồng cung ứng, hoặc từ chối; lợi nhuận/rủi ro chia theo kỳ tháng.

### E-03. Đột biến chi phí (sửa chữa lớn, y tế, phạt)
- **Trigger:** ngẫu nhiên thấp hoặc hệ quả từ sự kiện trước (bỏ bê bảo trì, ốm nặng, vi phạm).
- **Lựa chọn:** trả ngay (giảm tiền), trả góp/vay (tăng nợ, lãi tháng), dùng bảo hiểm/quỹ (nếu có) — nhấn mạnh phòng hộ tài chính.

### E-04. Cơ hội bán nhanh tài sản
- **Trigger:** khi cần tiền gấp hoặc thị trường sôi động.
- **Lựa chọn:** bán nhanh dưới giá (mất 10–20% giá trị), chờ giá tốt (rủi ro bỏ lỡ), hoặc đấu giá ngắn (1–2 ngày).

### E-05. Thưởng/bonus hiệu suất kinh doanh cuối tháng
- **Trigger:** doanh thu/lợi nhuận công ty hoặc chỉ tiêu cá nhân vượt ngưỡng trong tháng.
- **Hậu quả:** `+tiền`, `+reputation`, mở cơ hội mở rộng tháng sau.

---

## 7. Sự kiện xã hội, gia đình & nghề nghiệp

### R-01. Xung đột nhỏ với đồng nghiệp/đối tác
- **Lựa chọn:** đối thoại, nhờ hòa giải, leo thang — ảnh hưởng `reputation`, cơ hội thăng tiến/hợp tác, stress.

### R-02. Cơ hội giới thiệu/mentoring
- **Trigger:** `reputation` tốt hoặc follow-up quan hệ.
- **Hậu quả:** mở khóa kỹ năng/đào tạo/gig tốt hơn sau 5–15 ngày; tốn thời gian tham gia.

### R-03. Sự kiện gia đình (nhắc nhở – không ép nội dung nhạy cảm)
- **Ví dụ an toàn:** kỷ niệm, hỗ trợ việc nhà, chăm người thân mệt, góp chi phí gia đình.
- **Lựa chọn:** tham gia/chi tiền/thời gian để `+relationship/mood`, hoặc ưu tiên công việc (`+tiền`, `-relationship` nhẹ).

### R-04. Tin vui/cơ hội trong mạng lưới
- **Trigger:** mạng lưới quan hệ tích cực.
- **Hậu quả:** thông tin việc làm/đầu tư sớm, giảm chi phí giao dịch, hỗ trợ khi khó khăn (một lần).

### R-05. Đề nghị đổi việc/nhảy việc
- **Trigger:** kỹ năng/uy tín đạt ngưỡng, thị trường tháng thuận.
- **Lựa chọn:** ở lại (thưởng trung thành/đàm phán), chuyển (lương/điều kiện tốt hơn nhưng rủi ro thử việc), từ chối giữ quan hệ.

---

## 8. Rủi ro, cám dỗ & thế giới ngầm (tùy mức heat/luật)

> **Nguyên tắc:** luôn hiển thị rủi ro & giới hạn; hậu quả tỷ lệ với phần thưởng.

### U-01. Lời mời “việc nhẹ lương cao”
- **Trigger:** ban đêm, `cash` thấp hoặc `heat` nhất định; thấp tần suất.
- **Lựa chọn:** từ chối; tham gia (thu `+tiền` nhanh nhưng `+heat` lớn, rủi ro phạt/sự kiện xấu sau 1–10 ngày); điều tra trước (tốn thời gian, giảm rủi ro).

### U-02. Cám dỗ gian lận nhỏ
- **Bối cảnh:** cơ hội khai gian/không trung thực để lợi tức thời.
- **Hậu quả:** lợi ngắn hạn vs `-reputation/credit`, `+heat`, rủi ro bị phát hiện theo kỳ kiểm tra (M-06).

### U-03. Trò may rủi hạn chế
- **Giới hạn:** 1 lần/ngày hoặc vài lần/tháng, trần tiền cược nhỏ.
- **Hậu quả:** phân phối xác suất công khai; thắng/thua tiền, `+heat/mood` biến động.

---

## 9. Cột mốc & chuỗi tiến trình (Milestones)

| ID | Cột mốc | Điều kiện gợi ý | Phần thưởng/sự kiện mở |
|---|---|---|---|
| MS-01 | Tự chủ tài chính đầu tiên | Dư tiền cuối tháng dương 3 tháng liên tiếp | Huy hiệu, gợi ý tiết kiệm/đầu tư, +uy tín nhỏ |
| MS-02 | Trả hết một khoản nợ | Nợ mục tiêu = 0 | Bonus tinh thần, cải thiện `credit_score` |
| MS-03 | Sở hữu nơi ở ổn định | Có nhà ở hợp lệ | Mở hoạt động tại nhà, giảm rủi ro một số sự kiện |
| MS-04 | Thăng tiến nghề nghiệp | Đạt mốc kỹ năng/uy tín/lương | Mở chuỗi sự kiện quản lý/cơ hội mới |
| MS-05 | Nhà đầu tư mới | Lần đầu nhận cổ tức/lãi đầu tư | Mở tin tức & cơ hội đầu tư định kỳ |
| MS-06 | Doanh nhân | Công ty đạt mốc doanh thu/ổn định | Sự kiện hợp tác, hợp đồng lớn |
| MS-07 | Gia đình vững vàng | Cột mốc gia đình (tùy hệ thống) | Sự kiện gia đình tích cực, hỗ trợ |

*Mỗi cột mốc nên có một “khoảnh khắc” recap ngắn + 1 lựa chọn phần thưởng (tiền / vật phẩm-buff / danh tiếng) để tăng cảm giác cá nhân hóa.*

---

## 10. Nhịp theo thời gian (tóm tắt triển khai)

| Tầng thời gian | Nội dung gợi ý | Cơ chế hệ thống |
|---|---|---|
| **Trong ngày (phút/giờ game)** | Lựa chọn sự kiện ngắn, hoạt động theo buổi (sáng/tối), cooldown phút | `minuteOfDay`, `hour`, `period` |
| **Mỗi ngày/tick** | 0–1 daily event, tiến triển/timeout arc theo ngày, cơ hội/gig trong ngày | tick xử lý ngày, reset daily |
| **Chuỗi 2–7+ ngày** | Arc freelance, khủng hoảng sức khỏe/việc, thương lượng, giao dịch hẹn | state + deadline theo ngày |
| **Tháng (30 ngày)** | Tin tức vĩ mô, hóa đơn/lương, mục tiêu tháng, báo cáo, cơ hội cửa sổ 3–5 ngày | `periodKey YYYY-MM`, day 1/28–30 |
| **Mùa** | Thời tiết, lễ hội, giá/nhu cầu, sức khỏe, du lịch cao điểm | `season`, `seasonEffects` |
| **Năm (360 ngày)** | Tổng kết, sự kiện cố định, cột mốc dài hạn | `year`, `dayOfYear` |

---

## 11. Ghi chú cân bằng & an toàn
- **Tỷ lệ & trần:** giới hạn lợi nhuận/rủi ro mỗi sự kiện theo tài sản hiện tại (tránh snowball hoặc sập quá nhanh); daily event không được vượt ±X% tiền mặt hay ±Y thể lực trừ arc đặc biệt.
- **Chống spam:** cooldown theo `id`, tối đa 1 popup chủ động/ngày, ưu tiên sự kiện ngữ cảnh cao nhất.
- **Minh bạch:** hiển thị rõ chi phí, xác suất (nếu có), và hậu quả chính trước khi chọn.
- **Liên kết hệ thống hiện có:** thể lực (`health_energy`), nghỉ ngơi/y tế/giải trí/du lịch, việc làm & lương, công ty, BĐS, tiết kiệm/vay/thuế, gia đình, heat/danh tiếng — để sự kiện tạo ý nghĩa chứ không tách rời.
- **Mở rộng dần:** bắt đầu với 10–15 daily + 2–3 arc + 4 sự kiện mùa + 4 sự kiện tháng, đo tỉ lệ chọn & tác động rồi bổ sung.
