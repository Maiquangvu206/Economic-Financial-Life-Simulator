import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type { AccountProfileResponse, CharacterDto, SessionUser } from '@efls/contracts';
import { apiRequest } from '../shared/api/httpClient';
import { useSessionStore } from '../features/auth/sessionStore';
import { toast } from '../shared/ui/Toast';
import { CharacterSectionNav } from '../shared/character/CharacterSectionNav';

export function CharacterAccountPage() {
  const qc = useQueryClient();
  const sessionUser = useSessionStore((s) => s.user);
  const setSession = useSessionStore((s) => s.setSession);

  const { data: character } = useQuery({
    queryKey: ['character', 'me'],
    queryFn: () => apiRequest<CharacterDto>('/api/v1/characters/me'),
  });

  const [profileForm, setProfileForm] = useState({ username: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    if (sessionUser) {
      setProfileForm({ username: sessionUser.username ?? '' });
    }
  }, [sessionUser]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      return apiRequest<AccountProfileResponse>('/api/v1/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ username: profileForm.username.trim() }),
      });
    },
    onSuccess: async (res) => {
      const updatedUser: SessionUser = {
        ...(sessionUser ?? ({} as SessionUser)),
        ...(res.user as any),
      };
      const { accessToken, refreshToken } = useSessionStore.getState();
      if (accessToken && refreshToken) {
        setSession({ accessToken, refreshToken, user: updatedUser });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['character', 'me'] }),
        qc.invalidateQueries({ queryKey: ['session', 'profile'] }),
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

  function onSubmitProfile(e: FormEvent) {
    e.preventDefault();
    updateProfile.mutate();
  }

  function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    changePassword.mutate();
  }

  return (
    <div className="space-y-5 pb-[env(safe-area-inset-bottom)]">
      <PageHeader title="Tài khoản" description="Quản lý thông tin đăng nhập và bảo mật." />
      <CharacterSectionNav />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Thông tin tài khoản</h2>
          <form onSubmit={onSubmitProfile} className="mt-4 space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Họ và tên nhân vật</label>
              <input value={character?.fullName ?? ''} disabled readOnly className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700" />
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
              <input type="email" value={sessionUser?.email ?? ''} disabled readOnly className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700" autoComplete="email" />
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <button type="submit" disabled={updateProfile.isPending || !profileChanged} className="min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                {updateProfile.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Đổi mật khẩu</h2>
          <p className="mt-1 text-[11px] text-slate-600">Nhập mật khẩu hiện tại và mật khẩu mới (tối thiểu 8 ký tự).</p>
          <form onSubmit={onSubmitPassword} className="mt-4 space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Mật khẩu hiện tại</label>
              <input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm((s) => ({ ...s, currentPassword: e.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" autoComplete="current-password" required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Mật khẩu mới</label>
              <input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm((s) => ({ ...s, newPassword: e.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" autoComplete="new-password" minLength={8} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Xác nhận mật khẩu mới</label>
              <input type="password" value={pwForm.confirmPassword} onChange={(e) => setPwForm((s) => ({ ...s, confirmPassword: e.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="flex justify-end pt-1">
              <button type="submit" disabled={changePassword.isPending || !pwForm.currentPassword || !pwForm.newPassword} className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {changePassword.isPending ? 'Đang đổi...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
