# Admin app — ranh giới

`apps/admin` là ứng dụng riêng, **không** dùng chung route hay session với `apps/web-game`.

Nguyên tắc:

- Chỉ gọi các endpoint `/api/v1/admin/*` và được gateway kiểm tra role `admin`/`moderator`.
- Không import code từ `apps/web-game`.
- Mọi hành động can thiệp (phạt, ban, cứu trợ, sửa bản đồ, kích hoạt sự kiện) phải kèm lý do
  và được ghi audit log phía server.
- Map Editor và AI Console trong scaffold hiện là UI cục bộ; khi nối API phải dùng optimistic
  version để tránh ghi đè.
