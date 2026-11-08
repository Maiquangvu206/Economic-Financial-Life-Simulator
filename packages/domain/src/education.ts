/**
 * Vietnam-specific education & credential systems
 */

export type EducationLevel =
  | 'none'
  | 'primary' // Tiểu học
  | 'secondary' // THCS (Cấp 2)
  | 'high_school' // THPT (Cấp 3)
  | 'vocational' // Trung cấp / Cao đẳng nghề
  | 'bachelor' // Cử nhân / Kỹ sư đại học
  | 'master' // Thạc sĩ
  | 'doctorate'; // Tiến sĩ

export interface EducationInfo {
  level: EducationLevel;
  nameVi: string;
  minYearsStudy: number;
  baseSalaryMultiplier: number; // Hệ số lương nền tảng
  careerCeiling: string; // Vị trí giới hạn cao nhất
}

export const VIETNAM_EDUCATION_LEVELS: Record<EducationLevel, EducationInfo> = {
  none: {
    level: 'none',
    nameVi: 'Chưa qua đào tạo',
    minYearsStudy: 0,
    baseSalaryMultiplier: 1.0,
    careerCeiling: 'Lao động phổ thông',
  },
  primary: {
    level: 'primary',
    nameVi: 'Tiểu học',
    minYearsStudy: 5,
    baseSalaryMultiplier: 1.1,
    careerCeiling: 'Công nhân phụ việc',
  },
  secondary: {
    level: 'secondary',
    nameVi: 'Trung học cơ sở (THCS)',
    minYearsStudy: 9,
    baseSalaryMultiplier: 1.25,
    careerCeiling: 'Công nhân trực tiếp',
  },
  high_school: {
    level: 'high_school',
    nameVi: 'Tốt nghiệp THPT (Cấp 3)',
    minYearsStudy: 12,
    baseSalaryMultiplier: 1.5,
    careerCeiling: 'Tổ trưởng / Nhân viên cơ bản',
  },
  vocational: {
    level: 'vocational',
    nameVi: 'Trung cấp / Cao đẳng nghề',
    minYearsStudy: 14,
    baseSalaryMultiplier: 1.85,
    careerCeiling: 'Kỹ thuật viên chính / Quản đốc xưởng',
  },
  bachelor: {
    level: 'bachelor',
    nameVi: 'Đại học (Cử nhân / Kỹ sư)',
    minYearsStudy: 16,
    baseSalaryMultiplier: 2.5,
    careerCeiling: 'Trưởng phòng / Quản lý cấp trung',
  },
  master: {
    level: 'master',
    nameVi: 'Thạc sĩ',
    minYearsStudy: 18,
    baseSalaryMultiplier: 3.2,
    careerCeiling: 'Giám đốc khối / Giám đốc điều hành',
  },
  doctorate: {
    level: 'doctorate',
    nameVi: 'Tiến sĩ',
    minYearsStudy: 21,
    baseSalaryMultiplier: 4.2,
    careerCeiling: 'Chuyên gia cao cấp / Viện trưởng / Cố vấn HĐQT',
  },
};

export type CertificateType =
  | 'driving_a1' // Bằng lái xe máy A1
  | 'driving_b2' // Bằng lái ô tô B2
  | 'driving_c' // Bằng lái xe tải C
  | 'office_it' // Tin học văn phòng cơ bản
  | 'english_ielts_toeic' // Ngoại ngữ (Tiếng Anh giao tiếp/IELTS)
  | 'safety_labor' // An toàn vệ sinh lao động
  | 'chief_accountant' // Kế toán trưởng
  | 'project_management' // Chứng chỉ Quản lý dự án (PMP)
  | 'financial_advisor'; // Chứng chỉ Hành nghề Môi giới/Phân tích tài chính

export interface CertificateInfo {
  id: CertificateType;
  nameVi: string;
  category: 'Giao thông' | 'Kỹ năng mềm' | 'Kỹ thuật - An toàn' | 'Chuyên môn cao cấp';
  salaryBonusPercent: number; // Cộng thêm % lương
  employabilityBonus: number; // Điểm tăng cơ hội tuyển dụng
}

export const VIETNAM_CERTIFICATES: Record<CertificateType, CertificateInfo> = {
  driving_a1: {
    id: 'driving_a1',
    nameVi: 'Giấy phép lái xe máy A1',
    category: 'Giao thông',
    salaryBonusPercent: 2,
    employabilityBonus: 5,
  },
  driving_b2: {
    id: 'driving_b2',
    nameVi: 'Giấy phép lái xe ô tô B2',
    category: 'Giao thông',
    salaryBonusPercent: 8,
    employabilityBonus: 15,
  },
  driving_c: {
    id: 'driving_c',
    nameVi: 'Giấy phép lái xe tải hạng C',
    category: 'Giao thông',
    salaryBonusPercent: 14,
    employabilityBonus: 20,
  },
  office_it: {
    id: 'office_it',
    nameVi: 'Chứng chỉ Tin học văn phòng Chuẩn Bộ TTTT',
    category: 'Kỹ năng mềm',
    salaryBonusPercent: 5,
    employabilityBonus: 12,
  },
  english_ielts_toeic: {
    id: 'english_ielts_toeic',
    nameVi: 'Chứng chỉ Tiếng Anh (TOEIC / IELTS)',
    category: 'Kỹ năng mềm',
    salaryBonusPercent: 15,
    employabilityBonus: 25,
  },
  safety_labor: {
    id: 'safety_labor',
    nameVi: 'Chứng chỉ An toàn vệ sinh lao động Nhóm 3',
    category: 'Kỹ thuật - An toàn',
    salaryBonusPercent: 6,
    employabilityBonus: 18,
  },
  chief_accountant: {
    id: 'chief_accountant',
    nameVi: 'Chứng chỉ Bồi dưỡng Kế toán trưởng',
    category: 'Chuyên môn cao cấp',
    salaryBonusPercent: 25,
    employabilityBonus: 30,
  },
  project_management: {
    id: 'project_management',
    nameVi: 'Chứng chỉ Quản trị dự án chuyên nghiệp',
    category: 'Chuyên môn cao cấp',
    salaryBonusPercent: 30,
    employabilityBonus: 35,
  },
  financial_advisor: {
    id: 'financial_advisor',
    nameVi: 'Chứng chỉ Hành nghề Chứng khoán & Tài chính',
    category: 'Chuyên môn cao cấp',
    salaryBonusPercent: 28,
    employabilityBonus: 35,
  },
};
