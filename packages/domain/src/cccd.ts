/**
 * CCCD kiểu Việt Nam: 12 chữ số, 3 số đầu là mã tỉnh (001–034).
 * Game dùng nội bộ UUID, nhưng hiển thị ID kiểu CCCD cho người chơi.
 */

/** 34 tỉnh/thành VN (sau sáp nhập 2025): 6 thành phố TW + 28 tỉnh. */
export interface Province {
  code: string;
  name: string;
  region: 'Bắc' | 'Trung' | 'Nam';
  isCity: boolean;
}

export const PROVINCES_34: Province[] = [
  { code: '001', name: 'Thành phố Hà Nội', region: 'Bắc', isCity: true },
  { code: '004', name: 'Tỉnh Cao Bằng', region: 'Bắc', isCity: false },
  { code: '008', name: 'Tỉnh Tuyên Quang', region: 'Bắc', isCity: false },
  { code: '011', name: 'Tỉnh Điện Biên', region: 'Bắc', isCity: false },
  { code: '012', name: 'Tỉnh Lai Châu', region: 'Bắc', isCity: false },
  { code: '014', name: 'Tỉnh Sơn La', region: 'Bắc', isCity: false },
  { code: '015', name: 'Tỉnh Lào Cai', region: 'Bắc', isCity: false },
  { code: '019', name: 'Tỉnh Thái Nguyên', region: 'Bắc', isCity: false },
  { code: '020', name: 'Tỉnh Lạng Sơn', region: 'Bắc', isCity: false },
  { code: '022', name: 'Tỉnh Quảng Ninh', region: 'Bắc', isCity: false },
  { code: '024', name: 'Tỉnh Bắc Ninh', region: 'Bắc', isCity: false },
  { code: '025', name: 'Tỉnh Phú Thọ', region: 'Bắc', isCity: false },
  { code: '031', name: 'Thành phố Hải Phòng', region: 'Bắc', isCity: true },
  { code: '033', name: 'Tỉnh Hưng Yên', region: 'Bắc', isCity: false },
  { code: '037', name: 'Tỉnh Ninh Bình', region: 'Bắc', isCity: false },
  { code: '038', name: 'Tỉnh Thanh Hóa', region: 'Bắc', isCity: false },
  { code: '040', name: 'Tỉnh Nghệ An', region: 'Bắc', isCity: false },
  { code: '042', name: 'Tỉnh Hà Tĩnh', region: 'Trung', isCity: false },
  { code: '044', name: 'Tỉnh Quảng Trị', region: 'Trung', isCity: false },
  { code: '046', name: 'Thành phố Huế', region: 'Trung', isCity: true },
  { code: '048', name: 'Thành phố Đà Nẵng', region: 'Trung', isCity: true },
  { code: '051', name: 'Tỉnh Quảng Ngãi', region: 'Trung', isCity: false },
  { code: '052', name: 'Tỉnh Gia Lai', region: 'Trung', isCity: false },
  { code: '056', name: 'Tỉnh Khánh Hòa', region: 'Trung', isCity: false },
  { code: '066', name: 'Tỉnh Đắk Lắk', region: 'Trung', isCity: false },
  { code: '068', name: 'Tỉnh Lâm Đồng', region: 'Trung', isCity: false },
  { code: '075', name: 'Tỉnh Đồng Nai', region: 'Nam', isCity: false },
  { code: '079', name: 'Thành phố Hồ Chí Minh', region: 'Nam', isCity: true },
  { code: '080', name: 'Tỉnh Tây Ninh', region: 'Nam', isCity: false },
  { code: '082', name: 'Tỉnh Đồng Tháp', region: 'Nam', isCity: false },
  { code: '086', name: 'Tỉnh Vĩnh Long', region: 'Nam', isCity: false },
  { code: '091', name: 'Tỉnh An Giang', region: 'Nam', isCity: false },
  { code: '092', name: 'Thành phố Cần Thơ', region: 'Nam', isCity: true },
  { code: '096', name: 'Tỉnh Cà Mau', region: 'Nam', isCity: false },
];

const PROVINCE_CODES = new Set(PROVINCES_34.map((p) => p.code));

export function provinceByCode(code: string): Province | null {
  return PROVINCES_34.find((p) => p.code === code) ?? null;
}

/** Sinh CCCD 12 số: mã tỉnh (3) + 9 chữ số ngẫu nhiên. `rand` mặc định Math.random. */
export function generateCccd(provinceCode: string, rand: () => number = Math.random): string {
  if (!PROVINCE_CODES.has(provinceCode)) {
    throw new Error(`Invalid province code: ${provinceCode}`);
  }
  let rest = '';
  for (let i = 0; i < 9; i += 1) {
    rest += String(Math.floor(rand() * 10));
  }
  return provinceCode + rest;
}

export function isValidCccd(value: string): boolean {
  return /^\d{12}$/.test(value) && PROVINCE_CODES.has(value.slice(0, 3));
}

export function provinceCodeFromCccd(cccd: string): string | null {
  return isValidCccd(cccd) ? cccd.slice(0, 3) : null;
}

/** Định dạng hiển thị dạng CCCD: 001 234 567 890 (nhóm 3-3-3-3). */
export function formatCccd(cccd: string): string {
  if (!isValidCccd(cccd)) return cccd;
  return `${cccd.slice(0, 3)} ${cccd.slice(3, 6)} ${cccd.slice(6, 9)} ${cccd.slice(9, 12)}`;
}
