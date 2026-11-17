/**
 * CCCD kiểu Việt Nam (12 chữ số). 3 số đầu là mã tỉnh/thành (theo PROVINCES_34).
 * Nội bộ DB vẫn dùng character.id (UUID) làm khóa chính; CCCD dùng để tra cứu/giao dịch giữa người chơi.
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
  { code: '038', name: 'Tỉnh Thanh Hóa', region: 'Trung', isCity: false },
  { code: '040', name: 'Tỉnh Nghệ An', region: 'Trung', isCity: false },
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

export interface GenerateCccdOptions {
  gender?: 'male' | 'female' | number;
  birthYear?: number;
  rand?: () => number;
}

function normalizeProvinceCode(provinceCode: string): string {
  if (PROVINCE_CODES.has(provinceCode)) return provinceCode;
  throw new Error(`Invalid province code: ${provinceCode}`);
}

function genderCenturyDigit(gender: GenerateCccdOptions['gender'], birthYear?: number): string | null {
  if (birthYear == null || !Number.isFinite(birthYear)) return null;
  const y = Math.trunc(birthYear);
  let centuryBase = 0; // 1900-1999
  if (y >= 2000 && y <= 2099) centuryBase = 2; // 2000-2099
  else if (y >= 2100 && y <= 2199) centuryBase = 4; // 2100-2199
  else if (y >= 1800 && y <= 1899) centuryBase = 0;
  // mã hóa giới tính theo quy ước phổ biến: nam chẵn, nữ lẻ trong cùng thế kỷ
  let male = true;
  if (typeof gender === 'number') male = gender % 2 === 0;
  else if (gender === 'female') male = false;
  else if (gender === 'male') male = true;
  return String(centuryBase + (male ? 0 : 1));
}

/**
 * Sinh CCCD 12 số duy nhất (ứng dụng phải đảm bảo không trùng với DB).
 * Hỗ trợ (provinceCode, rand) tương thích cũ và (provinceCode, gender, birthYear, rand?).
 * Cấu trúc: [3 mã tỉnh][1 mã giới tính/thế kỷ nếu có, ngược lại ngẫu nhiên][2 năm sinh nếu có][6 số ngẫu nhiên].
 */
export function generateCccd(
  provinceCode: string,
  genderOrRand?: 'male' | 'female' | number | (() => number),
  birthYear?: number,
  randMaybe?: () => number,
): string {
  const prefix = normalizeProvinceCode(provinceCode);
  let rand: () => number = Math.random;
  let gender: GenerateCccdOptions['gender'];
  let year: number | undefined;
  if (typeof genderOrRand === 'function') {
    rand = genderOrRand;
  } else {
    gender = genderOrRand;
    year = birthYear;
    if (typeof randMaybe === 'function') rand = randMaybe;
  }

  const gDigit = genderCenturyDigit(gender, year);
  const yy = year != null && Number.isFinite(year) ? String(Math.trunc(year) % 100).padStart(2, '0') : null;

  let tailLen = 9;
  let mid = '';
  if (gDigit) { mid += gDigit; tailLen -= 1; }
  if (yy) { mid += yy; tailLen -= 2; }
  let rest = '';
  for (let i = 0; i < Math.max(0, tailLen); i += 1) {
    rest += String(Math.floor(rand() * 10));
  }
  let cccd = (prefix + mid + rest).slice(0, 12);
  if (cccd.length < 12) {
    while (cccd.length < 12) cccd += String(Math.floor(rand() * 10));
  }
  return cccd;
}

export function isValidCccd(value: string): boolean {
  return /^\d{12}$/.test(value) && PROVINCE_CODES.has(value.slice(0, 3));
}

export function provinceCodeFromCccd(cccd: string): string | null {
  if (!/^\d{12}$/.test(cccd)) return null;
  const code = cccd.slice(0, 3);
  return PROVINCE_CODES.has(code) ? code : null;
}

/** Định dạng hiển thị: 001 234 567 890 (nhóm 3-3-3-3). */
export function formatCccd(cccd: string): string {
  if (!/^\d{12}$/.test(cccd)) return cccd;
  return `${cccd.slice(0, 3)} ${cccd.slice(3, 6)} ${cccd.slice(6, 9)} ${cccd.slice(9, 12)}`;
}

/** Che CCCD để bảo vệ riêng tư: ********1234 */
export function maskCccd(cccd: string): string {
  if (!/^\d{12}$/.test(cccd)) return '************';
  return `********${cccd.slice(-4)}`;
}
