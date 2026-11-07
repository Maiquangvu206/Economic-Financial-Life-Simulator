# player-management

Tra cứu người chơi, tài sản, lịch sử giao dịch và xử lý vi phạm.

- API dự kiến: `GET /api/v1/admin/players`, `POST /api/v1/admin/players/:id/actions`.
- Hành động: fine, ban, unban, grant_aid.
- Bắt buộc audit log: actor, target, action, reason, timestamp, request id.
