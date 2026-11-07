# auth

Đăng nhập, đăng ký, refresh token, session người dùng.

- Server state: `/api/v1/auth/*`.
- Client state: `sessionStore` (token + user), persist localStorage.
- Không lưu refresh token trong Zustand nếu chuyển sang cookie httpOnly; khi đó chỉ giữ access token trong memory.
- Mọi lỗi 401 phải xóa session và điều hướng về `/login`.
