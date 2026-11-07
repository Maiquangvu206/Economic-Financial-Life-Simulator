# ADR 0002 — Server-authoritative, tiền là số nguyên

- Trạng thái: Accepted
- Ngày: 2026-11-07

## Bối cảnh

Game mô phỏng tài chính: lãi vay, khớp lệnh, cổ tức, thuế, phát mại. Sai số float hoặc client
tự tính sẽ phá kinh tế và tạo lỗ hổng gian lận.

## Quyết định

1. Client chỉ gửi **ý định**; server tính và quyết định kết quả.
2. Tiền lưu và truyền dưới dạng **integer minor units** (cents) + currency.
3. Tỷ lệ/lãi suất dùng decimal string hoặc numeric trong DB; không float cho tính tiền.
4. Rule kinh tế nằm trong `packages/domain`, pure và deterministic.
5. Thời gian/random được truyền vào rule; không gọi clock/RNG ẩn.
6. Transaction + khóa row cho mọi mutation số dư/portfolio.
7. Outbox event trong cùng transaction.

## Hệ quả

- Client không thể gian lận bằng cách sửa payload kết quả.
- Test rule dễ, tái lập được.
- Cần API rõ ràng cho mọi hành động; client không "tính hộ".
- Hiển thị tiền cần format ở client nhưng không dùng để quyết định.

## Không chọn

- Tính tiền bằng float: sai số tích lũy, không chấp nhận.
- Client-authoritative: dễ hack, không thể audit.
- Microservice saga cho từng giao dịch ở giai đoạn này: phức tạp không tương xứng.
