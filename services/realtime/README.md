# Realtime service

Socket.IO gateway cho thành phố, chat, sàn chứng khoán và phiên tòa.

## Ranh giới

- **Không** ghi database, **không** tính tiền, **không** khớp lệnh.
- Chỉ giữ kết nối, xác thực JWT, quản lý room và phát event.
- Nguồn event: worker/game-core publish vào Redis channel `efls:realtime` theo envelope:
  ```json
  { "room": "stock_market_room", "event": "market:tick", "payload": { "...": "..." } }
  ```
- Redis adapter cho phép scale nhiều instance mà không cần sticky session cho event.

## Room allowlist

| Room                         | Quyền                                  |
| ---------------------------- | -------------------------------------- |
| `city_map_room:<cityId>`     | mọi player                             |
| `stock_market_room`          | mọi player                             |
| `ticker_room:<tickerId>`     | mọi player                             |
| `chat_room:<channelId>`      | mọi player (rate limit 5 tin / 3 giây) |
| `courtroom_session:<caseId>` | sẽ kiểm tra thành viên vụ án           |
| `character_room:<id>`        | chỉ chủ nhân                           |
| `admin_room`                 | admin/moderator                        |

## Chưa làm

- Presence đầy đủ (đang trả về danh sách rỗng/1 người).
- Kiểm tra membership phiên tòa.
- Lưu chat có kiểm duyệt và phân trang.
- Resolve displayName từ projection cache.
