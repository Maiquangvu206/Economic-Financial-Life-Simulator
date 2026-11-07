# stock-market

Sàn chứng khoán và hàng hóa.

- Order book, khớp lệnh price-time priority (server).
- Nến realtime qua `lightweight-charts`, không tự tính giá.
- Đặt/hủy lệnh, danh mục, cổ tức, IPO.
- AI news có thể tác động giá trong biên cho phép; không bao giờ do client quyết định.

API: `/api/v1/stock-market/*`.
Realtime: `stock_market_room`, `ticker_room:*`.
