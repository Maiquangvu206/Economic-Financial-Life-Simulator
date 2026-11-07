# Worker service

Xử lý tác vụ nền và game loop. **Không** expose API công khai.

## Queue

| Queue           | Chu kỳ                                 | Trạng thái |
| --------------- | -------------------------------------- | ---------- |
| `game-tick`     | `GAME_TICK_INTERVAL_MS` (mặc định 24h) | skeleton   |
| `outbox-relay`  | 1 giây                                 | hoạt động  |
| `ai-news`       | cron `AI_NEWS_CRON`                    | skeleton   |
| `loan-interest` | theo tick                              | chưa nối   |
| `foreclosure`   | theo tick                              | chưa nối   |
| `tax-audit`     | theo tick                              | chưa nối   |

## Outbox relay

- Đọc `outbox_events` chưa publish với `FOR UPDATE SKIP LOCKED`.
- Publish envelope lên Redis `efls:domain-events`.
- Đánh dấu `published_at` trong cùng transaction.
- At-least-once: consumer phải idempotent theo event id.

## Thứ tự game tick (bắt buộc)

1. Aging / health / lifespan.
2. Lãi vay, grace period, hàng đợi phát mại.
3. Khấu hao BĐS và thu tiền thuê.
4. OPEX công ty, lương, cổ tức.
5. Audit thuế.
6. Chỉ số vĩ mô + GM AI proposal (advisory).
7. Snapshot offline recap.

Mỗi bước phải idempotent theo `(tick, step)` để retry an toàn.
