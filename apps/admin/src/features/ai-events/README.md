# ai-events

Kích hoạt sự kiện vĩ mô và cấu hình tham số prompt/provider LLM.

- Sự kiện: banking crisis, pandemic, crime sweep, market boom/crash.
- Phải ghi audit log và phát event qua outbox.
- Không chỉnh sửa prompt trực tiếp trên production; prompt version hóa và chạy eval.
- AI không có quyền ghi state; chỉ trả proposal cho game-core.
