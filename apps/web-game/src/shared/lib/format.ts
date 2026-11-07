/**
 * Format tiền tệ chuẩn Việt Nam (VND - Đồng)
 * 1 đơn vị trong game = 1 VNĐ (hoặc minor unit nếu quy đổi)
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Rút gọn số tiền bằng tiếng Việt: nghìn, triệu, tỷ
 */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ ₫`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr ₫`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} k ₫`;
  }
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatVietnamDate(day: number, month: number, year: number): string {
  const paddedDay = day.toString().padStart(2, '0');
  const paddedMonth = month.toString().padStart(2, '0');
  return `${paddedDay}/${paddedMonth}/${year}`;
}

export function formatVietnamTime(hour: number, minute: number): string {
  const paddedHour = hour.toString().padStart(2, '0');
  const paddedMinute = minute.toString().padStart(2, '0');
  return `${paddedHour}:${paddedMinute}`;
}
