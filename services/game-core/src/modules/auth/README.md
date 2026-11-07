# Auth module

Sở hữu: `users`, phiên đăng nhập, refresh token.

Trách nhiệm:

- Đăng ký, đăng nhập, refresh token (JWT access + refresh).
- Hash mật khẩu bằng bcrypt (cost 12).
- Tạo character khởi đầu trong cùng transaction với user.
- Phát event `user.registered.v1` qua outbox.

Không thuộc module này:

- Phân quyền chi tiết theo tài nguyên (thuộc từng module, dùng `actorRole`).
- Quản lý hồ sơ nhân vật (thuộc `characters`).
- Reset mật khẩu / email verification (bổ sung sau, cùng module).
