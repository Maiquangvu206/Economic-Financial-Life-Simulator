# Security & anti-cheat

## 1. Trust boundary

```
Không tin: browser, socket payload, header do client gửi, nội dung chat/lời khai.
Tin: gateway đã xác thực JWT, header nội bộ do gateway gắn, service token nội bộ.
```

- Gateway xóa `x-actor-*` do client gửi trước khi forward.
- Core chỉ nhận request có `x-internal-token`.
- AI chỉ nhận request có `x-ai-token`.
- PostgreSQL/Redis không public.

## 2. Server-authoritative

Mọi thứ sau đây chỉ tính ở server:

- Giá, khớp lệnh, order book.
- Lãi, phạt, credit score, phát mại.
- Xác suất audit, heat, rơi đồ, bệnh tật.
- Bản án, tác động tin tức, cổ tức.
- Quyền sở hữu, quyền tham gia phiên tòa.

Client chỉ gửi ý định ("tôi muốn mua 10 cổ ở giá X"), không gửi kết quả.

## 3. Auth & session

- Access token ngắn hạn (15 phút), refresh token dài hạn (30 ngày).
- Refresh token rotation + thu hồi khi đổi mật khẩu/ban.
- Không lưu refresh token trong localStorage nếu chuyển sang cookie httpOnly.
- Socket handshake dùng access token; reconnect phải lấy token mới.
- Admin yêu cầu role `admin`/`moderator` + có thể thêm IP allowlist/SSO.

## 4. Rate limit & abuse

- Gateway: 300 req/phút/IP; auth 10 req/phút/IP.
- Realtime: chat 5 tin/3 giây/socket; giới hạn payload 64KB.
- Đặt lệnh, chuyển tiền: rate limit theo character + idempotency key.
- Phát hiện bất thường: nhiều tài khoản cùng IP, giao dịch lặp, giá lệch.

## 5. Chống gian lận kinh tế

- Khóa row khi cập nhật số dư/portfolio.
- Kiểm tra số dư sau mọi bước trong transaction; không cho âm ngoài chính sách.
- Idempotency cho mutation tài chính.
- Audit trail bất biến cho hành động admin.
- Giới hạn biên giá, khối lượng, tần suất; circuit breaker khi thị trường bất thường.
- Không dùng client timestamp để tính lãi; dùng clock server.

## 6. Secrets

- Không commit `.env`, key, token.
- Secret production quản lý bởi secret manager; rotate định kỳ.
- Log không chứa token, password hash, API key.
- `JWT_*`, `INTERNAL_SERVICE_TOKEN`, `AI_SERVICE_TOKEN` phải khác nhau và đủ dài.

## 7. Payment / P2P

Nếu có nạp/rút thật:

- Tách payment service, không trộn ví game.
- Webhook ký và verify; idempotent.
- Không tự động cộng tiền từ client callback.
- Tuân thủ KYC/AML theo khu vực.

## 8. Audit log

Ghi tối thiểu:

```
actor_id, actor_role, action, target_type, target_id,
before, after, reason, request_id, ip, created_at
```

Bắt buộc cho: phạt/ban/cứu trợ, sửa bản đồ, kích hoạt sự kiện vĩ mô, thay đổi prompt/provider,
can thiệp giao dịch, hủy niêm yết.

## 9. AI security

- Prompt injection từ nội dung người chơi: coi là dữ liệu.
- Không gửi PII/secret vào LLM.
- AI output luôn validate schema + guardrail.
- AI không có credential DB/Redis.
- Có thể tắt AI (`LLM_PROVIDER=fake`) mà game vẫn chạy bằng fallback rule.
