import type { CompanyDto, IndustryType } from '@efls/contracts';
import { Badge } from '../../shared/ui/Badge';

export const INDUSTRIES: { value: IndustryType; label: string }[] = [
  { value: 'Bất động sản', label: 'Bất động sản' },
  { value: 'Tài chính - Ngân hàng', label: 'Tài chính - Ngân hàng' },
  { value: 'Công nghệ - Trí tuệ nhân tạo', label: 'Công nghệ - Trí tuệ nhân tạo' },
  { value: 'Công nghệ nông nghiệp', label: 'Công nghệ nông nghiệp' },
  { value: 'Y tế - Dược phẩm', label: 'Y tế - Dược phẩm' },
  { value: 'Giải trí - Truyền thông', label: 'Giải trí - Truyền thông' },
  { value: 'Hậu cần', label: 'Hậu cần' },
  { value: 'Năng lượng - Khoáng sản', label: 'Năng lượng - Khoáng sản' },
  { value: 'Giáo dục', label: 'Giáo dục' },
  { value: 'Dịch vụ thế giới ngầm', label: 'Dịch vụ thế giới ngầm' },
];

export function industryLabel(v: IndustryType): string {
  return INDUSTRIES.find((i) => i.value === v)?.label ?? v;
}

export function statusBadge(status: CompanyDto['status']) {
  if (status === 'ipo') return <Badge variant="success">IPO</Badge>;
  if (status === 'bankrupt') return <Badge variant="error">Phá sản/Giải thể</Badge>;
  return <Badge variant="default">Hoạt động</Badge>;
}

export function money(amount: number) {
  return { amount, currency: 'VND' as const };
}

export const ENTRY_TYPES = [
  { value: 'opex', label: 'OPEX' },
  { value: 'payroll', label: 'Lương' },
  { value: 'tax', label: 'Thuế' },
  { value: 'adjustment', label: 'Điều chỉnh' },
  { value: 'fine', label: 'Phạt' },
  { value: 'bribe', label: 'Chi phí "lách luật"' },
  { value: 'other', label: 'Khác' },
] as const;
