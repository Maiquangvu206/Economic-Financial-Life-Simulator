# banking

Sở hữu: `loans`, `credit_scores`, `collaterals`, `savings`, `auctions`.

- Vay ngân hàng/P2P, thế chấp, cầm cố.
- Tính lãi, grace period, phạt, phát mại.
- Credit score cập nhật theo lịch sử thanh toán.
- Dùng rule trong `@efls/domain` (`accrueSimpleInterest`, `evaluateLoanHealth`, ...).

Event: `loan.approved.v1`, `loan.defaulted.v1`, `loan.repaid.v1`, `collateral.foreclosed.v1`.
