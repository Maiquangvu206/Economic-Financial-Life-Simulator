# Tài liệu kiến trúc EFLS

Bộ tài liệu này là nguồn chuẩn cho cấu trúc dự án. Khi code và tài liệu lệch nhau, sửa một
trong hai trong cùng PR — không để lệch âm thầm.

| Tài liệu                                                 | Nội dung                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| [architecture/overview.md](architecture/overview.md)     | Bức tranh hệ thống, luồng dữ liệu, cổng dịch vụ            |
| [architecture/boundaries.md](architecture/boundaries.md) | Ma trận phụ thuộc, quy tắc import, ranh giới front/back/AI |
| [architecture/frontend.md](architecture/frontend.md)     | Feature slice, state, Phaser bridge, admin                 |
| [architecture/backend.md](architecture/backend.md)       | Modular monolith, transaction, outbox, idempotency         |
| [architecture/realtime.md](architecture/realtime.md)     | Room, event, scale, reconnect                              |
| [architecture/ai.md](architecture/ai.md)                 | AI advisory, prompt version, guardrail                     |
| [architecture/security.md](architecture/security.md)     | Trust boundary, anti-cheat, secrets, audit                 |
| [database/README.md](database/README.md)                 | Chuẩn schema, quyền sở hữu bảng                            |
| [adr/](adr/)                                             | Các quyết định kiến trúc đã chốt                           |
| [roadmap.md](roadmap.md)                                 | Thứ tự triển khai theo GDD                                 |

## Nguyên tắc bất biến

1. **Server-authoritative**: client không bao giờ quyết định tiền, giá, xác suất hay quyền.
2. **Một nguồn sự thật cho contract**: `packages/contracts` (TS) và `ai/app/domain/schemas.py`
   (Python) phải khớp nhau; thay đổi contract là thay đổi có review.
3. **Domain thuần**: `packages/domain` không IO, không clock, không random ẩn.
4. **AI chỉ cố vấn**: AI trả proposal; core kiểm tra rule rồi mới áp dụng.
5. **Tiền là số nguyên minor units**: không float.
6. **Mỗi thay đổi trạng thái quan trọng có event**: ghi outbox trong cùng transaction.
7. **Ranh giới rõ hơn tầng**: không import chéo feature/module; giao tiếp qua contract/event/API.
