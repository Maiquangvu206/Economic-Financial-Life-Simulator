# Module: banking — ví, khoản vay, tín dụng

## Bảng sở hữu

`savings_accounts`, `loans`, `loan_payments`, `credit_events` (dùng chung bảng `ledger_*` của ledger context).

## Event tiêu biểu

- `loan.opened.v1` — giải ngân khoản vay mới.
- `loan.repaid.v1` — tất toán khoản vay.
- `loan.defaulted.v1` — nợ xấu (xét bởi worker tick).

## Luồng giữ quy tắc

1. Mọi biến động tiền đều qua `LedgerService.post` trong transaction (`withTransaction`).
2. Tài khoản `characters.cash_minor` được đồng bộ tự động từ ledger khi post leg loại `cash` của character.
3. Credit score được tính toán lại (deterministic từ `@efls/domain`) sau mỗi sự kiện ảnh hưởng tài chính.
4. Không gọi AI trực tiếp từ repository.

## Routes (`/api/v1/banking`)

| Phương thức | Đường dẫn            | Mô tả                                             |
| ----------- | -------------------- | ------------------------------------------------- |
| GET         | /overview            | Bảng cân đối, nợ, tín dụng, khoản vay đang-active |
| POST        | /loans               | Đơn vay mới (kiểm tra hạn mức, thế chấp)          |
| GET         | /loans/:loanId       | Chi tiết một khoản vay                            |
| POST        | /loans/:loanId/repay | Trả nợ (gốc+lãi theo quy tắc domain)              |
| POST        | /savings/deposit     | Gửi tiết kiệm (chuyển cash → savings)             |
| POST        | /savings/withdraw    | Rút tiết kiệm (chuyển savings → cash)             |

## Đặc biệt

- Hạn mức vay dựa trên lương × 24 × hệ số tín dụng, tối đa 200_000_000 minor.
- Thế chấp tối đa 80% giá trị bất động sản sở hữu.
- Lãi compute bằng `accrueSimpleInterest` từ domain, không float.
