import { TokenPairSchema } from '@efls/contracts';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../features/auth/sessionStore';
import { apiRequest } from '../shared/api/httpClient';

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useSessionStore((state) => state.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<unknown>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const parsed = TokenPairSchema.safeParse(response);
      if (!parsed.success) {
        setError('Phản hồi đăng nhập không hợp lệ.');
        return;
      }
      setSession(parsed.data);
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng nhập.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-surface-900 p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">EFLS</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-100">Đăng nhập</h1>
        <p className="mt-1 text-xs text-slate-500">Tài khoản của bạn là chìa khóa tới thành phố.</p>

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-xs text-slate-400">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-surface-850 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Mật khẩu
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-surface-850 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
            />
          </label>

          {error ? <p className="text-xs text-rose-300">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
