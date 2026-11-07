# Backend architecture

## 1. Hình thái

`services/game-core` là **modular monolith**:

- Một deployable, transaction ACID trong cùng database.
- Nhiều bounded context trong `src/modules/*`.
- Tách service vật lý chỉ khi có lý do scale/team rõ ràng (realtime, worker, AI đã tách).

Lý do: game kinh tế cần transaction nhất quán giữa tiền, tài sản, cổ phiếu. Tách microservice
quá sớm sẽ tạo saga phức tạp trước khi có nhu cầu.

## 2. Layering

```
HTTP route
  → controller (parse, status code)
    → service (use case, transaction, quyền)
      → repository (SQL, mapping)
        → PostgreSQL

service → @efls/domain (rule thuần)
service → AI client (proposal, timeout)
service → outbox (event trong cùng transaction)
```

Không nhảy tầng. Controller không SQL. Repository không quyết định nghiệp vụ.

## 3. Transaction & outbox

Mọi thao tác đổi tiền/tài sản:

```ts
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // 1. khóa row (SELECT ... FOR UPDATE)
  // 2. kiểm tra quyền + rule domain
  // 3. ghi state
  // 4. enqueueDomainEvent(client, ...)
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

- Outbox đảm bảo state và event không lệch nhau.
- Worker relay publish at-least-once; consumer idempotent theo event id.
- Event name: `<aggregate>.<action>.v1`, quá khứ, có version.

## 4. Idempotency

- Mutation tài chính nhận `Idempotency-Key` từ client (bổ sung khi làm API giao dịch).
- Bảng `idempotency_keys` (scope, key, request_hash, response) — sẽ thêm ở migration giao dịch.
- Worker job dùng `(tick, step)` hoặc `jobId` cố định.

## 5. Auth & trust

- Gateway xác thực JWT, gắn `x-actor-id`, `x-actor-role`, `x-internal-token`.
- Core từ chối request thiếu internal token; không tin header do client gửi.
- Gateway xóa header danh tính do client cung cấp trước khi forward.
- Admin route kiểm tra role ở cả gateway và core (defense in depth).

## 6. Error & response

- Lỗi dùng RFC 7807 (`application/problem+json` nội dung).
- Validation Zod → 422 kèm `errors[]`.
- Không trả stack trace/DB error ra ngoài.
- Request id xuyên suốt gateway → core → log.

## 7. Money & thời gian

- Tiền: `bigint` minor units; không float; không `Number` cho tổng lớn nếu có thể tránh.
- Thời gian: UTC `timestamptz`; domain nhận `Date`/timestamp tường minh, không gọi `Date.now()`
  bên trong rule.
- Random: chỉ ở server, inject seed/RNG để test được.

## 8. Khi nào tách service?

Tách khi có ít nhất một trong các điều kiện:

- Nhu cầu scale khác biệt rõ (realtime, AI).
- Vòng đời deploy khác biệt.
- Ranh giới dữ liệu/team ổn định và đã có contract/event.
- Chi phí phối hợp thấp hơn lợi ích vận hành.

Không tách chỉ vì "microservice là hiện đại".
