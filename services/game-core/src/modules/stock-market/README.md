# stock-market

Sở hữu: `stock_ticker`, `order_books`, `trades`, `dividends`, `price_history`.

- Đặt/hủy lệnh, khớp lệnh price-time priority (`@efls/domain`).
- AMM là module mở rộng, không trộn vào order book.
- Giá tham chiếu, biên độ, cổ tức, IPO.
- Phát tick qua outbox -> Redis -> realtime.

Event: `order.filled.v1`, `ticker.ticked.v1`, `dividend.paid.v1`.
