# Realtime architecture

## 1. Vai trò

`services/realtime` là tầng kết nối, không phải tầng nghiệp vụ:

- Xác thực JWT khi handshake.
- Quản lý room, presence, fan-out.
- Rate limit chat và kích thước payload.
- Không ghi DB, không tính tiền, không khớp lệnh.

## 2. Room

Xem `packages/contracts/src/realtime/rooms.ts`.

| Room                           | Mục đích                           |
| ------------------------------ | ---------------------------------- |
| `city_map_room:<cityId>`       | vị trí người chơi, sự kiện khu vực |
| `stock_market_room`            | tick thị trường chung              |
| `ticker_room:<tickerId>`       | order book/giá của một mã          |
| `courtroom_session:<caseId>`   | phiên tòa                          |
| `chat_room:<channelId>`        | chat kênh/khu vực                  |
| `character_room:<characterId>` | thông báo cá nhân                  |
| `admin_room`                   | cảnh báo vận hành                  |

Client không được tự join room ngoài allowlist. Membership phiên tòa và kênh chat phải được
kiểm tra ở server khi nối dữ liệu thật.

## 3. Event naming

- Client → server: động từ hiện tại `player:move`, `chat:send`, `room:join`.
- Server → client: danh từ/sự kiện `player:moved`, `chat:message`, `market:tick`.
- Domain event (outbox): quá khứ `order.filled.v1`, `loan.defaulted.v1`.
- Không tái sử dụng tên event với payload khác nghĩa; tạo version mới.

## 4. Luồng fan-out

```
core/worker → outbox_events → worker relay → Redis "efls:domain-events"
                                              │
                                              ▼
                                 projection worker (future)
                                              │
                                              ▼
                                 Redis "efls:realtime"
                                              │
                                              ▼
                                      realtime instances
                                              │
                                              ▼
                                          clients
```

Giai đoạn scaffold, realtime subscribe trực tiếp `efls:realtime`. Khi có projection, tách rõ
domain event và realtime envelope.

## 5. Scale

- Redis adapter cho phép nhiều instance realtime.
- Sticky session chỉ cần nếu dùng polling transport; ưu tiên WebSocket.
- Mỗi room lớn (thành phố) cần giới hạn tần suất broadcast vị trí (ví dụ 10 Hz).
- Không broadcast toàn server cho thay đổi cục bộ.

## 6. Reconnect & consistency

- Client reconnect với token mới; nếu 401, refresh rồi thử lại.
- Sau reconnect, client phải refetch snapshot qua REST, không giả định event không mất.
- Server có thể phát `presence:sync` để client đối chiếu.
- Event realtime là gợi ý cập nhật; REST là nguồn sự thật.

## 7. Bảo mật

- Giới hạn `maxHttpBufferSize`, rate limit chat, validate mọi payload bằng Zod.
- Không render HTML từ chat.
- Không log token.
- Room admin chỉ role admin/moderator.
