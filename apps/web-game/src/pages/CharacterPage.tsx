import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { StatCard } from '../shared/ui/StatCard';
import { Badge } from '../shared/ui/Badge';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { type CharacterDto } from '@efls/contracts';

const MARITAL_LABEL: Record<CharacterDto['maritalStatus'], string> = {
  single: 'Độc thân',
  married: 'Đã kết hôn',
  divorced: 'Đã ly hôn',
  widowed: 'Góa',
};

function formatCccd(cccd: string): string {
  if (!/^\d{12}$/.test(cccd)) return cccd;
  return `${cccd.slice(0, 3)} ${cccd.slice(3, 6)} ${cccd.slice(6, 9)} ${cccd.slice(9, 12)}`;
}

/**
 * Trang tổng quan nhân vật: một thẻ CCCD duy nhất gộp số CCCD + thông tin cơ bản.
 * Tên / nơi sinh / CCCD cố định từ lúc đăng ký (hoặc khi sinh con mới).
 */
export function CharacterPage() {
  const { data: character, isLoading } = useQuery<CharacterDto>({
    queryKey: ['characters', 'me'],
    queryFn: () => apiRequest<CharacterDto>('/api/v1/characters/me'),
  });

  const [copiedCccd, setCopiedCccd] = useState(false);

  async function copyCccd() {
    if (!character?.cccd) return;
    try {
      await navigator.clipboard.writeText(character.cccd);
      setCopiedCccd(true);
      setTimeout(() => setCopiedCccd(false), 2000);
    } catch {
      // clipboard không khả dụng
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Tổng quan nhân vật" description="Đang tải hồ sơ..." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải...</p>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="space-y-5">
        <PageHeader title="Tổng quan nhân vật" description="Hồ sơ nhân vật của bạn." />
        <div className="rounded-3xl border border-slate-200 bg-white/70 p-6">
          <p className="text-sm text-slate-600">
            Hãy tạo nhân vật từ trang Thành phố trước khi xem hồ sơ.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Tổng quan: ${character.fullName ?? '—'}`}
        description="Thẻ căn cước công dân — mã ID 12 số cố định từ lúc đăng ký, dùng để chat riêng."
      />

      {/* Thẻ CCCD */}
      <div className="overflow-hidden rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
            <span aria-hidden>🇻🇳</span> CĂN CƯỚC CÔNG DÂN (EFLS)
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            {character.birthplaceName ?? 'Hà Nội'}
          </span>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500">Số căn cước công dân</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="select-all rounded-xl bg-white px-3 py-2 font-mono text-2xl font-black tracking-[0.3em] text-slate-900 ring-1 ring-emerald-200">
              {character.cccd ? formatCccd(character.cccd) : '(chưa cấp)'}
            </code>
            {character.cccd && (
              <button
                type="button"
                onClick={() => void copyCccd()}
                className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105"
              >
                {copiedCccd ? 'Đã sao chép ✓' : 'Sao chép CCCD'}
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between border-b border-slate-100 pb-1">
              <span className="text-slate-500">Họ và tên</span>
              <span className="font-semibold">{character.fullName ?? '—'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-1">
              <span className="text-slate-500">Nơi sinh</span>
              <span className="font-semibold">{character.birthplaceName ?? '—'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-1">
              <span className="text-slate-500">Tuổi</span>
              <span>{character.age ?? 0} tuổi</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-1">
              <span className="text-slate-500">Giới tính / Hôn nhân</span>
              <Badge variant="default">
                {MARITAL_LABEL[character.maritalStatus] ?? character.maritalStatus ?? '—'}
              </Badge>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-1">
              <span className="text-slate-500">Ngày cấp</span>
              <span>
                {character.createdAt
                  ? new Date(character.createdAt).toLocaleDateString('vi-VN')
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tài sản ròng"
          value={formatMoney(character.netWorth?.amount ?? 0)}
          hint="Tổng tài sản − tổng nợ"
          tone="positive"
        />
        <StatCard
          label="Credit Score"
          value={character.creditScore ?? 0}
          hint="Tín dụng & hạn mức vay"
        />
        <StatCard
          label="Heat Level"
          value={`${character.heatLevel ?? 0} / 100`}
          hint="Mức truy nã ngầm"
        />
        <StatCard
          label="Sức khỏe / Năng lượng"
          value={`${character.healthEnergy ?? 0} / 100`}
          hint="Càng thấp càng cần nghỉ"
        />
      </div>
    </div>
  );
}
