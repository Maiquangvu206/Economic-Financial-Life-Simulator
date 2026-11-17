import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type { AccountProfileResponse, CharacterDto, SessionUser } from '@efls/contracts';
import { StatCard } from '../shared/ui/StatCard';
import { Badge } from '../shared/ui/Badge';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { useSessionStore } from '../features/auth/sessionStore';
import { toast } from '../shared/ui/Toast';

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

/**
 * Trang tổng quan nhân vật + cài đặt tài khoản (đổi thông tin & mật khẩu).
 * CCCD/Nơi sinh là định danh; cho phép cập nhật thông tin tài khoản và tên hiển thị nhân vật.
 */
export function CharacterPage() {
  const queryClient = useQueryClient();
  const sessionUser = useSessionStore((s) => s.user);
  const accessToken = useSessionStore((s) => s.accessToken);
  const refreshToken = useSessionStore((s) => s.refreshToken);
  const setSession = useSessionStore((s) => s.setSession);

  const { data: character, isLoading } = useQuery<CharacterDto>({
    queryKey: ['characters', 'me'],
    queryFn: () => apiRequest<CharacterDto>('/api/v1/characters/me'),
  });

  const [copiedCccd, setCopiedCccd] = useState(false);

  const [profileForm, setProfileForm] = useState({
    username: '',
  });
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    setProfileForm({
      username: sessionUser?.username ?? '',
    });
  }, [sessionUser?.username]);

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

  function applyUpdatedUser(user: SessionUser) {
    if (accessToken && refreshToken) {
      setSession({ accessToken, refreshToken, user });
    }
  }

  const updateProfile = useMutation({
    mutationFn: async () => {
      const username = profileForm.username.trim();

      if (!username) {
        throw new Error('Tên đăng nhập không được để trống.');
      }
      if (username === (sessionUser?.username ?? '')) {
        throw new Error('Bạn chưa thay đổi tên đăng nhập.');
      }
      return apiRequest<AccountProfileResponse>('/api/v1/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username }),
      });
    },
    onSuccess: async (res) => {
      applyUpdatedUser(res.user);
      setProfileForm({ username: res.user.username });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['characters', 'me'] }),
      ]);
      toast({ title: 'Cập nhật thành công', description: res.message || 'Đã đổi tên đăng nhập.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Không thể cập nhật thông tin',
        description: err?.problem?.detail || err?.message || 'Vui lòng kiểm tra lại dữ liệu.',
        variant: 'error',
      });
    },
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (pwForm.newPassword.length < 8) throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự.');
      if (pwForm.newPassword !== pwForm.confirmPassword) throw new Error('Xác nhận mật khẩu mới không khớp.');
      return apiRequest<{ ok: boolean; message?: string }>('/api/v1/auth/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
    },
    onSuccess: (res) => {
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast({ title: 'Đổi mật khẩu thành công', description: res.message || 'Mật khẩu đã được cập nhật.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Không thể đổi mật khẩu',
        description: err?.problem?.detail || err?.message || 'Vui lòng kiểm tra mật khẩu hiện tại.',
        variant: 'error',
      });
    },
  });

  const profileChanged = useMemo(() => {
    const u = profileForm.username.trim();
    return !!u && u !== (sessionUser?.username ?? '');
  }, [profileForm.username, sessionUser?.username]);

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

  function onSubmitProfile(e: FormEvent) {
    e.preventDefault();
    updateProfile.mutate();
  }

  function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    changePassword.mutate();
  }

  return (
    <div className="space-y-5">
      <PageHeader title={`Tổng quan: ${character.fullName ?? '—'}`} />

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Tài sản ròng" value={formatMoney(character.netWorth?.amount ?? 0)} tone="positive" />
        <StatCard label="Ngày sống (nhân vật)" value={`${getActiveDays(character.createdAt)} ngày`} />
        <StatCard label="Điểm tín dụng" value={character.creditScore ?? 0} />
        <StatCard label="Mức chú ý" value={`${character.heatLevel ?? 0} / 100`} />
        <StatCard label="Sức khỏe / Năng lượng" value={`${character.healthEnergy ?? 0} / 100`} />
      </div>

      {/* Cài đặt tài khoản */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Thông tin tài khoản</h2>
          <form onSubmit={onSubmitProfile} className="mt-4 space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Họ và tên nhân vật</label>
              <input
                value={character.fullName ?? ''}
                disabled
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Tên đăng nhập</label>
              <input
                value={profileForm.username}
                onChange={(e) => setProfileForm({ username: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                minLength={3}
                maxLength={32}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={sessionUser?.email ?? ''}
                disabled
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700"
                autoComplete="email"
              />
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="submit"
                disabled={updateProfile.isPending || !profileChanged}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {updateProfile.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Đổi mật khẩu</h2>
          <p className="mt-1 text-[11px] text-slate-600">
            Nhập mật khẩu hiện tại và mật khẩu mới (tối thiểu 8 ký tự). Nên sử dụng mật khẩu mạnh và không chia sẻ.
          </p>
          <form onSubmit={onSubmitPassword} className="mt-4 space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Mật khẩu hiện tại</label>
              <input
                type="password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm((s) => ({ ...s, currentPassword: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                autoComplete="current-password"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Mật khẩu mới</label>
              <input
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((s) => ({ ...s, newPassword: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm((s) => ({ ...s, confirmPassword: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={changePassword.isPending || !pwForm.currentPassword || !pwForm.newPassword}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {changePassword.isPending ? 'Đang đổi...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
