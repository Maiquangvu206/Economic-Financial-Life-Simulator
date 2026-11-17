import { SsoHandoffResponseSchema, TokenPairSchema } from '@efls/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionStore } from '../features/auth/sessionStore';
import { apiRequest } from '../shared/api/httpClient';
import { env } from '../shared/config/env';

type Mode = 'login' | 'register';

function isStaffRole(role: string): boolean {
  return role === 'admin' || role === 'moderator';
}

type LoginBroadcast = {
  id: string;
  title: string;
  content: string;
  type: 'urgent' | 'maintenance' | 'event' | 'economy' | 'news';
  pinned: boolean;
  sender: string;
  createdAt: string;
};

const BROADCAST_STYLE: Record<LoginBroadcast['type'], { icon: string; cls: string }> = {
  urgent: { icon: '🚨', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
  maintenance: { icon: '⚙️', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  event: { icon: '🎉', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  economy: { icon: '📈', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
  news: { icon: '📰', cls: 'border-slate-200 bg-slate-50 text-slate-800' },
};

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('vi-VN'); } catch { return iso; }
}

// 34 tỉnh/thành theo domain PROVINCES_34 + seed 0016_provinces_official.sql (mã chính thức 2025).
const PROVINCES_34_STATIC: { code: string; name: string }[] = [
  { code: '001', name: 'Thành phố Hà Nội' },
  { code: '004', name: 'Tỉnh Cao Bằng' },
  { code: '008', name: 'Tỉnh Tuyên Quang' },
  { code: '011', name: 'Tỉnh Điện Biên' },
  { code: '012', name: 'Tỉnh Lai Châu' },
  { code: '014', name: 'Tỉnh Sơn La' },
  { code: '015', name: 'Tỉnh Lào Cai' },
  { code: '019', name: 'Tỉnh Thái Nguyên' },
  { code: '020', name: 'Tỉnh Lạng Sơn' },
  { code: '022', name: 'Tỉnh Quảng Ninh' },
  { code: '024', name: 'Tỉnh Bắc Ninh' },
  { code: '025', name: 'Tỉnh Phú Thọ' },
  { code: '031', name: 'Thành phố Hải Phòng' },
  { code: '033', name: 'Tỉnh Hưng Yên' },
  { code: '037', name: 'Tỉnh Ninh Bình' },
  { code: '038', name: 'Tỉnh Thanh Hóa' },
  { code: '040', name: 'Tỉnh Nghệ An' },
  { code: '042', name: 'Tỉnh Hà Tĩnh' },
  { code: '044', name: 'Tỉnh Quảng Trị' },
  { code: '046', name: 'Thành phố Huế' },
  { code: '048', name: 'Thành phố Đà Nẵng' },
  { code: '051', name: 'Tỉnh Quảng Ngãi' },
  { code: '052', name: 'Tỉnh Gia Lai' },
  { code: '056', name: 'Tỉnh Khánh Hòa' },
  { code: '066', name: 'Tỉnh Đắk Lắk' },
  { code: '068', name: 'Tỉnh Lâm Đồng' },
  { code: '075', name: 'Tỉnh Đồng Nai' },
  { code: '079', name: 'Thành phố Hồ Chí Minh' },
  { code: '080', name: 'Tỉnh Tây Ninh' },
  { code: '082', name: 'Tỉnh Đồng Tháp' },
  { code: '086', name: 'Tỉnh Vĩnh Long' },
  { code: '091', name: 'Tỉnh An Giang' },
  { code: '092', name: 'Thành phố Cần Thơ' },
  { code: '096', name: 'Tỉnh Cà Mau' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSession = useSessionStore((state) => state.setSession);
  const staffDestination = searchParams.get('next') === 'admin';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthplaceCode, setBirthplaceCode] = useState('001');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [systemBroadcasts, setSystemBroadcasts] = useState<LoginBroadcast[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest<LoginBroadcast[]>('/api/v1/broadcasts/login');
        if (!cancelled) setSystemBroadcasts(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSystemBroadcasts([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const path = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const body =
        mode === 'login'
          ? { email, password }
          : { email, username, password, fullName: fullName.trim() || username, birthplaceCode };

      const response = await apiRequest<unknown>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const parsed = TokenPairSchema.safeParse(response);
      if (!parsed.success) {
        setError('Đăng nhập chưa thành công. Vui lòng thử lại.');
        return;
      }

      // Quản trị viên sẽ được chuyển sang trang quản lý; người chơi vào trò chơi.
      if (isStaffRole(parsed.data.user.role)) {
        setRedirecting(true);
        const handoffResponse = await apiRequest<unknown>('/api/v1/auth/sso/handoff', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: parsed.data.refreshToken }),
        });
        const handoff = SsoHandoffResponseSchema.safeParse(handoffResponse);
        if (!handoff.success) {
          setRedirecting(false);
          setError('Không thể chuyển sang trang quản lý. Vui lòng thử lại.');
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
      <div className="w-full max-w-6xl grid gap-5 lg:grid-cols-[minmax(320px,400px)_1fr] items-start">
        {/* Bảng thông báo hệ thống bên trái (tách khỏi khu vực đăng nhập) */}
        <aside className="order-2 lg:order-1 rounded-3xl border border-white/60 bg-white/95 shadow-soft p-5 sm:p-6 lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-lg ring-1 ring-amber-100">📢</span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Thông báo hệ thống</h2>
                <p className="text-[11px] text-slate-500">Cập nhật từ Ban Quản trị</p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
              {systemBroadcasts.length}
            </span>
          </div>

          {systemBroadcasts.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
              <div className="text-2xl mb-2">🗞️</div>
              <div className="text-sm font-medium text-slate-700">Chưa có thông báo</div>
              <div className="mt-1 text-xs text-slate-500">Thông báo hệ thống mới sẽ hiển thị tại đây.</div>
            </div>
          ) : (
            <div className="mt-4 space-y-3 max-h-[70vh] overflow-y-auto pr-1 [scrollbar-width:thin]">
              {systemBroadcasts.map((b) => {
                const style = BROADCAST_STYLE[b.type] ?? BROADCAST_STYLE.news;
                return (
                  <article key={b.id} className={`rounded-2xl border p-4 shadow-sm ${style.cls}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="mt-0.5 text-base leading-none">{style.icon}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold leading-snug text-slate-900 break-words">{b.title}</h3>
                            {b.pinned ? (
                              <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-800 ring-1 ring-amber-200">GHIM</span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-wide opacity-70">{b.type}</div>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">{b.content}</p>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-2 text-[11px] text-slate-600">
                      <span className="truncate">Người gửi: <b className="font-medium">{b.sender}</b></span>
                      <span className="shrink-0">{fmtDate(b.createdAt)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </aside>

        <div className="order-1 lg:order-2 grid w-full overflow-hidden rounded-3xl border border-white/60 bg-white shadow-soft md:grid-cols-[1.05fr_1fr]">
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


          </div>

          {/* Form panel (đăng nhập/đăng ký) */}
          <div className="p-7 sm:p-9">
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                onMouseDown={(e) => e.preventDefault()}
                className={`flex-1 rounded-lg px-3 py-2 transition ${mode === 'login'
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
                onMouseDown={(e) => e.preventDefault()}
                className={`flex-1 rounded-lg px-3 py-2 transition ${mode === 'register'
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
            </div>

            {/* Thông báo hệ thống hiển thị ở bảng riêng bên cạnh (không đặt trong phần đăng nhập) */}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {mode === 'register' ? (
                <>
                  <label htmlFor="register-username" className="block text-xs font-medium text-slate-600">
                    Tên công dân
                    <input
                      id="register-username"
                      required
                      minLength={3}
                      maxLength={32}
                      autoComplete="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Nguyễn Văn An"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>

                  <label htmlFor="register-full-name" className="block text-xs font-medium text-slate-600">
                    Họ và tên nhân vật
                    <input
                      id="register-full-name"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Nguyễn Văn An"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>

                  <label htmlFor="register-birthplace" className="block text-xs font-medium text-slate-600">
                    Nơi sinh
                    <select
                      id="register-birthplace"
                      value={birthplaceCode}
                      onChange={(event) => setBirthplaceCode(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    >
                      {PROVINCES_34_STATIC.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.code} · {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}

              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-600">
                Email
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ban@efls.vn"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-600">
                Mật khẩu
                <input
                  id="auth-password"
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
          </div>
        </div>
      </div>
    </div>
  );
}
