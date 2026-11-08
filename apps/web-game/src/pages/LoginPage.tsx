import { SsoHandoffResponseSchema, TokenPairSchema } from '@efls/contracts';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionStore } from '../features/auth/sessionStore';
import { apiRequest } from '../shared/api/httpClient';
import { env } from '../shared/config/env';

type Mode = 'login' | 'register';

function isStaffRole(role: string): boolean {
  return role === 'admin' || role === 'moderator';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSession = useSessionStore((state) => state.setSession);
  const staffDestination = searchParams.get('next') === 'admin';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const path = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const body = mode === 'login' ? { email, password } : { email, username, password };

      const response = await apiRequest<unknown>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const parsed = TokenPairSchema.safeParse(response);
      if (!parsed.success) {
        setError('Phản hồi đăng nhập không hợp lệ.');
        return;
      }

      // Một cổng duy nhất: quản trị viên được bàn giao sang bảng điều khiển,
      // người chơi ở lại ứng dụng game.
      if (isStaffRole(parsed.data.user.role)) {
        setRedirecting(true);
        const handoffResponse = await apiRequest<unknown>('/api/v1/auth/sso/handoff', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: parsed.data.refreshToken }),
        });
        const handoff = SsoHandoffResponseSchema.safeParse(handoffResponse);
        if (!handoff.success) {
          setRedirecting(false);
          setError('Không thể chuyển sang bảng điều khiển quản trị.');
          return;
        }
        window.location.assign(`${env.adminUrl}/sso?code=${encodeURIComponent(handoff.data.code)}`);
        return;
      }

      setSession(parsed.data);
      navigate('/', { replace: true });
    } catch (caught) {
      setRedirecting(false);
      setError(
        caught instanceof Error
          ? caught.message
          : mode === 'login'
            ? 'Không thể đăng nhập.'
            : 'Không thể tạo tài khoản.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-white/60 bg-white shadow-soft md:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-emerald-100 via-sky-100 to-violet-100 p-8 md:flex">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-lg shadow-sm">
                🏙️
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-700">
                  EFLS
                </p>
                <p className="text-xs font-medium text-slate-600">Việt Nam</p>
              </div>
            </div>

            <h1 className="mt-8 font-heading text-2xl font-bold leading-snug text-slate-800">
              Mô phỏng Kinh tế &amp; Cuộc sống
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Xây dựng sự nghiệp, quản lý tài chính, đầu tư bất động sản và sống trọn một vòng đời
              công dân — tất cả theo chuẩn tiền đồng Việt Nam.
            </p>

            <ul className="mt-6 space-y-2 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Thời gian trong game
                trôi theo giờ, ngày, mùa
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Ngân hàng, chứng khoán,
                doanh nghiệp &amp; pháp lý
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Lịch nghỉ lễ và phúc lợi
                theo Luật Lao động
              </li>
            </ul>
          </div>

          <p className="text-[11px] text-slate-500">
            Server xác thực mọi giao dịch. AI chỉ đưa ra đề xuất.
          </p>
        </div>

        {/* Form panel */}
        <div className="p-7 sm:p-9">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 rounded-lg px-3 py-2 transition ${
                mode === 'login'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 rounded-lg px-3 py-2 transition ${
                mode === 'register'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Tạo tài khoản
            </button>
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">
              {staffDestination
                ? 'Cổng đăng nhập quản trị'
                : mode === 'login'
                  ? 'Chào mừng trở lại'
                  : 'Bắt đầu cuộc sống mới'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {staffDestination
                ? 'Đăng nhập bằng tài khoản quản trị viên hoặc điều hành viên. Hệ thống sẽ tự mở bảng điều khiển.'
                : mode === 'login'
                  ? 'Một cổng duy nhất — hệ thống tự nhận diện vai trò và đưa bạn đến đúng nơi.'
                  : 'Tài khoản mới sẽ nhận một nhân vật công dân khởi điểm.'}
            </p>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {mode === 'register' ? (
              <label className="block text-xs font-medium text-slate-600">
                Tên công dân
                <input
                  required
                  minLength={3}
                  maxLength={32}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Nguyễn Văn An"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            ) : null}

            <label className="block text-xs font-medium text-slate-600">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ban@efls.vn"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="block text-xs font-medium text-slate-600">
              Mật khẩu
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting || redirecting}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition hover:brightness-105 disabled:opacity-60"
            >
              {redirecting
                ? 'Đang mở bảng điều khiển…'
                : submitting
                  ? 'Đang xử lý…'
                  : mode === 'login'
                    ? 'Đăng nhập'
                    : 'Tạo tài khoản & nhập thành phố'}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
            Hệ thống tự định tuyến theo vai trò: <b className="text-slate-700">công dân</b> vào
            game, <b className="text-slate-700">quản trị viên / điều hành viên</b> vào bảng điều
            khiển quản trị.
          </div>
        </div>
      </div>
    </div>
  );
}
