# Database — chuẩn và quyền sở hữu

PostgreSQL 16. Mỗi bounded context sở hữu bảng của mình; không query chéo bảng giữa các module
trong code (dùng service/event hoặc view read-only được review).

## Quy ước

- Khóa chính: `uuid`, sinh ở application (`crypto.randomUUID()`), không phụ thuộc extension.
- Thời gian: `timestamptz`, luôn UTC.
- Tiền: `bigint` minor units (cents). Không dùng `float`/`double`.
- Tỷ lệ: `numeric(p,s)`; không dùng float cho lãi suất.
- Tên bảng: số nhiều, snake_case. Cột: snake_case.
- Mọi bảng có `created_at`, bảng mutable có `updated_at`.
- Soft delete chỉ khi nghiệp vụ cần (ví dụ hợp đồng); mặc định không.
- Foreign key phải có `ON DELETE` rõ ràng.
- Index đặt tên `<table>_<columns>_idx`, unique `<table>_<columns>_uidx`.

## Migration

```
infra/db/migrations/
├─ 0001_foundation.sql
├─ 0001_foundation.down.sql
└─ ...
```

- Một migration chỉ thuộc một context (hoặc phần hạ tầng dùng chung).
- Không sửa migration đã chạy trên môi trường chia sẻ; tạo migration mới.
- Mỗi migration chạy trong transaction (trừ `CREATE INDEX CONCURRENTLY`).
- Down migration chỉ để dev; production rollback bằng migration tiến.

## Bản đồ context → bảng (theo GDD)

| Context      | Bảng                                                              |
| ------------ | ----------------------------------------------------------------- |
| identity     | users                                                             |
| characters   | characters, family_trees, wills, trust_funds                      |
| real-estate  | map_nodes, roads, properties, buildings, leases, auctions         |
| banking      | loans, credit_scores, collaterals, savings                        |
| corporations | companies, shareholders, employees, opex_entries                  |
| stock-market | stock_ticker, order_books, trades, dividends, price_history       |
| law          | court_cases, evidences, blackmail_contracts, marriage_contracts   |
| underworld   | criminal_records, fake_credentials, mercenary_orders, heat_events |
| logistics    | seaports, logistics_hubs, fleets, shipments, customs_declarations |
| education    | degrees, universities, tuition_payments                           |
| platform     | outbox_events, audit_log, macro_snapshots                         |

## Read model

Dashboard admin và offline recap nên đọc từ read model/bảng tổng hợp do worker ghi,
không join nặng trên bảng giao dịch realtime.
