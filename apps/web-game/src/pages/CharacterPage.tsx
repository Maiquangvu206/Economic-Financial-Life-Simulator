import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type { CharacterDto } from '@efls/contracts';
import { StatCard } from '../shared/ui/StatCard';
import { Badge } from '../shared/ui/Badge';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { CharacterSectionNav } from '../shared/character/CharacterSectionNav';

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

function getActiveDays(createdAt?: string | null) {
  if (!createdAt) return 1;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 1;
  return Math.max(1, Math.floor((Date.now() - t) / 86_400_000) + 1);
}

export function CharacterPage() {
  const { data: character, isLoading } = useQuery({
    queryKey: ['character', 'me'],
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
      setCopiedCccd(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px]">
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
        <CharacterSectionNav />
        <div className="rounded-3xl border border-slate-200 bg-white/70 p-6">
          <p className="text-sm text-slate-600">Hãy tạo nhân vật từ trang Thành phố trước khi xem hồ sơ.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-[env(safe-area-inset-bottom)]">
      <PageHeader title={`Tổng quan: ${character.fullName ?? '—'}`} description="Hồ sơ nhân vật và chỉ số tổng quan." />
      <CharacterSectionNav />

      <div className="overflow-hidden rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
            <span aria-hidden>🇻🇳</span> CĂN CƯỚC CÔNG DÂN (EFLS)
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            {character.birthplaceName ?? '—'}
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
              <span className="text-slate-500">Hôn nhân</span>
              <Badge variant="default">{MARITAL_LABEL[character.maritalStatus] ?? character.maritalStatus ?? '—'}</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Tài sản ròng" value={formatMoney(character.netWorth?.amount ?? 0)} tone="positive" />
        <StatCard label="Ngày sống (nhân vật)" value={`${getActiveDays(character.createdAt)} ngày`} />
        <StatCard label="Điểm tín dụng" value={character.creditScore ?? 0} />
        <StatCard label="Mức chú ý" value={`${character.heatLevel ?? 0} / 100`} />
        <StatCard label="Sức khỏe / Năng lượng" value={`${character.healthEnergy ?? 0} / 100`} />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Nghiệp vụ nhân vật</h2>
        <p className="mt-1 text-sm text-slate-600">Các nghiệp vụ đã được tách thành từng mục riêng để dễ quản lý.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link to="/character/wellness" className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 transition hover:bg-emerald-50">
            <div className="text-sm font-semibold text-emerald-800">Thể lực &amp; Hồi phục</div>
            <div className="mt-1 text-xs text-emerald-700">Nghỉ ngơi, y tế, bảo hiểm &amp; an sinh, giải trí.</div>
          </Link>
          <Link to="/character/account" className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:bg-slate-50">
            <div className="text-sm font-semibold text-slate-800">Tài khoản</div>
            <div className="mt-1 text-xs text-slate-600">Thông tin đăng nhập, tên đăng nhập và đổi mật khẩu.</div>
          </Link>
        </div>
      </section>
    </div>
  );
}
