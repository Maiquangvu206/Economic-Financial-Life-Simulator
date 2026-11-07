# Ranh giới & quy tắc phụ thuộc

## 1. Ma trận phụ thuộc

| Từ \ Đến               | contracts       | domain | ui  | core | gateway | realtime | worker | ai   | apps |
| ---------------------- | --------------- | ------ | --- | ---- | ------- | -------- | ------ | ---- | ---- |
| `packages/contracts`   | —               | ✗      | ✗   | ✗    | ✗       | ✗        | ✗      | ✗    | ✗    |
| `packages/domain`      | ✓               | —      | ✗   | ✗    | ✗       | ✗        | ✗      | ✗    | ✗    |
| `packages/ui`          | ✗               | ✗      | —   | ✗    | ✗       | ✗        | ✗      | ✗    | ✗    |
| `services/game-core`   | ✓               | ✓      | ✗   | —    | ✗       | ✗        | ✗      | HTTP | ✗    |
| `services/api-gateway` | ✓               | ✗      | ✗   | ✗    | —       | ✗        | ✗      | ✗    | ✗    |
| `services/realtime`    | ✓               | ✗      | ✗   | ✗    | ✗       | —        | ✗      | ✗    | ✗    |
| `services/worker`      | ✓               | ✓      | ✗   | ✗    | ✗       | ✗        | —      | HTTP | ✗    |
| `ai`                   | Pydantic mirror | ✗      | ✗   | ✗    | ✗       | ✗        | ✗      | —    | ✗    |
| `apps/web-game`        | ✓               | ✗      | ✓   | ✗    | ✗       | ✗        | ✗      | ✗    | —    |
| `apps/admin`           | ✓               | ✗      | ✓   | ✗    | ✗       | ✗        | ✗      | ✗    | —    |

Ghi chú:

- `packages/domain` chỉ phụ thuộc `contracts` để dùng type/enum chung; không import Zod runtime
  nếu không cần.
- Browser **không** import `packages/domain`: client không được có công thức quyết định tiền.
- AI không đọc DB, không gọi core; chỉ trả proposal qua HTTP.
- Worker không query chéo bảng nghiệp vụ tùy tiện; job phải gọi application service hoặc
  endpoint nội bộ của module sở hữu.

## 2. Những import bị cấm

```ts
// apps/web-game
import { calculateCreditScore } from '@efls/domain'; // ✗ client không quyết định tín dụng
import { pool } from '../../services/game-core/src/shared/db/pool'; // ✗
import { app } from '../../services/game-core/src/app'; // ✗
import { decideVerdict } from '../../ai/app/...'; // ✗

// services/game-core
import { io } from '../../realtime/src/server'; // ✗ core không phụ thuộc tầng realtime
import { HomePage } from '../../apps/web-game/src/pages/HomePage'; // ✗

// services/realtime
import { pool } from '../game-core/src/shared/db/pool'; // ✗ realtime không ghi DB

// ai
import psycopg2 // ✗ AI không truy cập database
```

## 3. Quy tắc giao tiếp

| Nhu cầu                       | Cách đúng                                                  |
| ----------------------------- | ---------------------------------------------------------- |
| Client cần dữ liệu            | REST qua gateway, DTO trong `@efls/contracts`              |
| Client cần realtime           | Socket.IO room do server cấp                               |
| Core muốn thông báo thay đổi  | Outbox event → Redis → projection/realtime                 |
| Module A cần dữ liệu module B | Gọi application service của B, hoặc read model được review |
| Worker chạy tác vụ định kỳ    | Import rule từ `@efls/domain`, gọi module application/API  |
| AI cần dữ liệu                | Core gửi payload đã lọc; AI không tự truy vấn              |
| Admin can thiệp hệ thống      | `/api/v1/admin/*`, có audit log + lý do                    |

## 4. Cấu trúc một feature/module mới

Frontend:

```
features/<domain>/
├─ api/          # query/mutation
├─ components/
├─ hooks/
├─ stores/       # chỉ client state
└─ README.md
```

Backend:

```
modules/<context>/
├─ <context>.routes.ts
├─ <context>.controller.ts
├─ <context>.service.ts
├─ <context>.repository.ts
├─ <context>.schemas.ts
└─ README.md
```

## 5. Định nghĩa "xong" cho một lát cắt

- Có contract (Zod) + Pydantic mirror nếu chạm AI.
- Có migration thuộc đúng context.
- Có test rule domain (nếu có công thức) và test service.
- Có outbox event + cập nhật read model/realtime nếu client cần thấy ngay.
- Có audit log nếu là hành động admin hoặc tài chính quan trọng.
- Có docs/README module cập nhật.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pytest` đều xanh.
