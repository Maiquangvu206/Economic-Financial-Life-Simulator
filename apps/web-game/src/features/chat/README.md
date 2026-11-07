# chat

Chat P2P, chat khu vực và chat phiên tòa.

- Room do server cấp; client không tự join room không có quyền.
- Rate limit và moderation phía server.
- Không render HTML thô từ người chơi.
- Tin nhắn chat không phải source of truth cho giao dịch.

Realtime: `chat:send`, `chat:message`, `chat_room:*`.
