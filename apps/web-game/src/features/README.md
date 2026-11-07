# Frontend feature pattern

Mỗi thư mục trong `features/` là một **vertical slice** theo domain nghiệp vụ:

```
features/<domain>/
├─ api/            # query/mutation gọi HTTP, chỉ dùng @efls/contracts
├─ components/     # UI riêng của domain
├─ hooks/          # hook kết hợp server state + realtime
├─ stores/         # client-only state (không phải source of truth)
├─ model/          # type/view-model/format riêng của domain
└─ README.md       # ranh giới và trạng thái
```

Quy tắc:

- `features/*` **không** import chéo lẫn nhau. Nếu cần dùng chung, đưa xuống `shared/` hoặc `packages/ui`.
- `shared/` chỉ chứa hạ tầng không biết nghiệp vụ: HTTP client, socket, config, format, layout.
- Server state thuộc React Query. Zustand chỉ giữ state client (UI, session cục bộ).
- Không tính toán tiền/tài sản ở client để thay đổi game state; mọi mutation phải qua API.
- `game/` là ranh giới duy nhất giữa React và Phaser. Không đọc/ghi Phaser scene từ page trực tiếp.

## Trạng thái các slice

| Slice           | Trạng thái                 | Ghi chú                                    |
| --------------- | -------------------------- | ------------------------------------------ |
| `auth`          | Session store + login page | Cần nối refresh token rotation             |
| `finance`       | Scaffold                   | Bảng cân đối, dòng tiền, tín dụng          |
| `real-estate`   | Scaffold                   | Sổ đất, cho thuê, thế chấp, đấu giá        |
| `business`      | Scaffold                   | Công ty, OPEX, IPO, takeover               |
| `stock-market`  | Scaffold                   | Order book, nến, cổ tức                    |
| `law`           | Scaffold                   | Tòa án, bằng chứng, thừa kế                |
| `underworld`    | Scaffold                   | PI, blackmail, heat                        |
| `chat`          | Chưa bắt đầu               | Dùng `chat_room:*`, chống spam phía server |
| `offline-recap` | Scaffold                   | Tổng hợp từ worker                         |
| `admin`         | App riêng `apps/admin`     | Tách khỏi client người chơi                |
