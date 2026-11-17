# underworld

Sở hữu: `criminal_records`, `fake_credentials`, `mercenary_orders`, `heat_events`, `sting_operations`.

- Thám tử tư, bằng chứng, tống tiền, gài bẫy.
- Heist, sabotage, hospitalization event.
- Heat Level, Đại án Công an toàn server.
- AI đánh giá Đại án định kỳ mỗi 3 giờ thực tế (`AI_SWEEP_INTERVAL_MS`, mặc định `10800000` ms).
- Dùng rule `@efls/domain` cho heat/audit risk.

Event: `heat.increased.v1`, `sweep.triggered.v1`, `blackmail.created.v1`.
