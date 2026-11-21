/**
 * Chuẩn hóa hiển thị tiền tệ VNĐ: 1.000.000 đ (dấu chấm phân tách hàng nghìn, đơn vị "đ")
 */
export function formatMoney(amount: number): string {
  const value = Number.isFinite(amount) ? Math.round(amount) : 0;
  const sign = value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toLocaleString('vi-VN')} đ`;
}

/**
 * Rút gọn số tiền bằng tiếng Việt: nghìn, triệu, tỷ (đơn vị chuẩn "đ")
 */
export function formatCompact(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ đ`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr đ`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} nghìn đ`;
  }
  return `${sign}${Math.abs(Math.round(value)).toLocaleString('vi-VN')} đ`;
}

/** Hiển thị đơn vị kỳ hạn/lãi suất rõ ràng */
export function formatRatePerYear(ratePct: number): string {
  const v = Number.isFinite(ratePct) ? ratePct : 0;
  return `${v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%/năm`;
}

export function formatMoneyPerMonth(amount: number): string {
  return `${formatMoney(amount)}/tháng`;
}

export function formatMoneyPerTerm(amount: number): string {
  return `${formatMoney(amount)}/kỳ`;
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

/** Đổi ngày trong năm game (0–359, năm game 360 ngày) sang ngày/tháng. */
export function gameDayOfYearToDate(dayOfYear: number): { day: number; month: number } {
  const normalized = ((Math.floor(dayOfYear) % 360) + 360) % 360;
  return { month: Math.floor(normalized / 30) + 1, day: (normalized % 30) + 1 };
}

/** Hiển thị một mốc thời gian game dạng dd/MM/yyyy (year là năm game). */
export function formatGameDate(dayOfYear: number, year: number): string {
  const { day, month } = gameDayOfYearToDate(dayOfYear);
  return formatVietnamDate(day, month, year);
}

export function formatVietnamTime(hour: number, minute: number): string {
  const paddedHour = hour.toString().padStart(2, '0');
  const paddedMinute = minute.toString().padStart(2, '0');
  return `${paddedHour}:${paddedMinute}`;
}
