# Frontend architecture

## 1. Phân tầng trong một app

```
src/
├─ app/         # bootstrap, providers, router — không chứa nghiệp vụ
├─ pages/       # composition theo route, mỏng, ghép feature
├─ features/    # vertical slice theo domain
├─ game/        # ranh giới Phaser (chỉ web-game)
├─ shared/      # hạ tầng không biết nghiệp vụ
└─ styles/
```

Luồng phụ thuộc: `app → pages → features → shared`. Không được đảo ngược.

## 2. Quy tắc feature

- Mỗi feature sở hữu API call, component, hook và state của domain đó.
- Không import chéo feature. Dùng `shared/` hoặc `packages/ui`.
- `features/*/api` chỉ dùng DTO từ `@efls/contracts`; không tự định nghĩa payload trùng lặp.
- Server state → React Query. Client state → Zustand. Không copy server state vào Zustand.
- Mutation thành công: invalidate query liên quan; không tự sửa cache bằng số liệu client tính.

## 3. State

| Loại           | Công cụ                            | Ví dụ                            |
| -------------- | ---------------------------------- | -------------------------------- |
| Server state   | React Query                        | danh mục BĐS, order book, hồ sơ  |
| Session        | Zustand persist                    | access token, user               |
| UI state       | local state / Zustand              | tab, panel mở, filter            |
| Realtime state | React Query cache hoặc store riêng | tick giá, presence               |
| Phaser state   | Phaser scene                       | vị trí render, camera, animation |

Không đưa toàn bộ order book realtime vào React state nếu tần suất cao; dùng buffer + throttle
ở một hook duy nhất.

## 4. Phaser ↔ React

- `game/PhaserGame.tsx` sở hữu vòng đời `Phaser.Game`.
- `game/scenes/*` chỉ render và phát input; không gọi API trực tiếp.
- `game/bridge/*` là nơi duy nhất trao đổi giữa React và Phaser.
- Dữ liệu bản đồ thật đến từ `map_nodes`/`roads`; scene không tự sinh quy hoạch trong production.
- React StrictMode mount/unmount hai lần: game phải `destroy(true)` sạch, không rò rỉ canvas.

## 5. Realtime

- Một socket singleton trong `shared/realtime/socket.ts`.
- Token lấy từ session store tại thời điểm kết nối; reconnect phải refresh token nếu hết hạn.
- Chỉ join room qua `room:join`; client không tự đặt tên room ngoài contract.
- Mọi payload socket phải được validate phía server; client vẫn nên defensive parse.

## 6. Admin app

- App riêng, không dùng chung route/session với web-game.
- Chỉ gọi `/api/v1/admin/*`; gateway kiểm tra role.
- Hành động can thiệp phải có form lý do và hiển thị cảnh báo audit.
- Map Editor/AI Console phải dùng version/optimistic lock khi nối API.

## 7. Hiệu năng

- Tách chunk Phaser và lightweight-charts (đã cấu hình trong `vite.config.ts`).
- Ảnh bản đồ: atlas + tilemap, không load từng file lẻ.
- Order book/price tick: cập nhật theo frame/throttle, không re-render toàn trang.
- Route nặng (stock, map) có thể lazy-load khi cần.
