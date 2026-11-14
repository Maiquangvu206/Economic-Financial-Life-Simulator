import { TokenPairSchema } from '@efls/contracts';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasAdminAccess, setAdminSession } from '../features/auth/session';
import { adminRequest } from '../shared/api/httpClient';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await adminRequest<unknown>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const parsed = TokenPairSchema.safeParse(response);
      if (!parsed.success) {
        setError('Phản hồi đăng nhập không hợp lệ.');
        return;
      }

      if (!hasAdminAccess(parsed.data.user.role)) {
        setError(
          `Tài khoản (${parsed.data.user.email}) mang vai trò '${parsed.data.user.role}', không có quyền truy cập bảng điều khiển quản trị (Cần 'admin' hoặc 'moderator').`,
        );
        return;
      }

      setAdminSession(parsed.data);
      navigate('/', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Đăng nhập không thành công. Vui lòng kiểm tra lại email và mật khẩu.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function fillCredentials(testEmail: string, testPass: string) {
    setEmail(testEmail);
    setPassword(testPass);
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-800">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl text-indigo-600">
            🛡️
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-800">
            EFLS Admin Portal
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Bảng điều khiển &amp; Quản trị vận hành kinh tế mô phỏng
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Email Quản trị
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@efls.local"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Mật khẩu
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700 leading-relaxed">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? 'Đang xác thực…' : 'Đăng nhập Quản trị'}
          </button>
        </form>

        {/* Quick test accounts */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="text-[11px] font-semibold text-slate-500">Tài khoản test mặc định:</p>
          <div className="mt-2.5 space-y-2">
            <button
              type="button"
              onClick={() => fillCredentials('admin@efls.local', 'Admin1234!')}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-indigo-50/50 hover:border-indigo-200"
            >
              <div>
                <span className="font-semibold text-indigo-700">admin@efls.local</span>
                <span className="ml-1 text-[10px] text-slate-400 font-mono">(Admin1234!)</span>
              </div>
              <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                ADMIN
              </span>
            </button>

            <button
              type="button"
              onClick={() => fillCredentials('moderator@efls.local', 'Admin1234!')}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-emerald-50/50 hover:border-emerald-200"
            >
              <div>
                <span className="font-semibold text-emerald-700">moderator@efls.local</span>
                <span className="ml-1 text-[10px] text-slate-400 font-mono">(Admin1234!)</span>
              </div>
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                MODERATOR
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

