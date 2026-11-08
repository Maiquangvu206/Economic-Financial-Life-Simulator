/**
 * Format tiền tệ chuẩn Việt Nam (VND - Đồng) dành cho Admin
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 1_000_000_000_000) {
    return `${sign}${(abs / 1_000_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} nghìn tỷ ₫`;
  }
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ ₫`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu ₫`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} nghìn ₫`;
  }
  return `${amount.toLocaleString('vi-VN')} ₫`;
}
