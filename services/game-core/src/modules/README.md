# Backend modules — chuẩn chung

`game-core` là **modular monolith**: một deployable, nhiều bounded context.

Mỗi module có cùng cấu trúc:

```
modules/<context>/
├─ <context>.routes.ts       # khai báo route, middleware, validate
├─ <context>.controller.ts   # parse request -> gọi service -> response
├─ <context>.service.ts      # use case, transaction boundary, gọi domain
├─ <context>.repository.ts   # SQL, mapping row -> entity
├─ <context>.schemas.ts      # schema nội bộ nếu khác contract công khai
├─ README.md                 # sở hữu bảng nào, event nào, ai được gọi
└─ index.ts (tuỳ chọn)
```

Quy tắc bắt buộc:

1. Route → controller → service → repository, không nhảy tầng.
2. Module khác **không** query trực tiếp bảng của module này; gọi service công khai hoặc event.
3. Mỗi use case ghi nhiều bảng phải nằm trong một transaction.
4. Mọi thay đổi trạng thái quan trọng ghi outbox event trong cùng transaction.
5. Repository chỉ dùng SQL tham số hóa; không nối chuỗi.
6. Money dùng `bigint` (minor units) và `Number` chỉ khi an toàn; ưu tiên chuỗi cho số lớn.
7. Không gọi AI service trực tiếp từ repository; chỉ service gọi qua client có timeout.

## Bản đồ module

| Module         | Bảng sở hữu                                                       | Event tiêu biểu                       |
| -------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `auth`         | users                                                             | user.registered.v1                    |
| `characters`   | characters, family_trees, wills, trust_funds                      | character.died.v1                     |
| `real-estate`  | map_nodes, roads, properties, buildings, leases, auctions         | property.sold.v1, lease.signed.v1     |
| `banking`      | loans, credit_scores, collaterals, savings                        | loan.defaulted.v1, loan.repaid.v1     |
| `corporations` | companies, shareholders, employees, opex                          | company.ipo.v1, company.takeover.v1   |
| `stock-market` | stock_ticker, order_books, trades, dividends                      | order.filled.v1, ticker.ticked.v1     |
| `law`          | court_cases, evidences, blackmail_contracts, wills                | case.verdict.v1                       |
| `underworld`   | criminal_records, fake_credentials, mercenary_orders              | heat.increased.v1, sweep.triggered.v1 |
| `logistics`    | seaports, logistics_hubs, fleets, shipments, customs_declarations | shipment.arrived.v1                   |
| `education`    | degrees, tuition, universities                                    | degree.earned.v1                      |
| `admin`        | audit_log, macro_events                                           | macro.event.triggered.v1              |
