import { TokenPairSchema } from '@efls/contracts';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { hasAdminAccess, setAdminSession } from '../features/auth/session';
import { adminRequest } from '../shared/api/httpClient';
import { env } from '../shared/config/env';

type State = { status: 'pending' } | { status: 'error'; message: string };

/**
 * Nhận mã bàn giao dùng một lần từ cổng đăng nhập duy nhất, đổi lấy phiên
 * quản trị rồi mở bảng điều khiển. Mã chỉ dùng được một lần trong 60 giây.
 */
export function SsoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const [state, setState] = useState<State>({ status: 'pending' });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!code) {
      setState({ status: 'error', message: 'Thiếu mã bàn giao đăng nhập.' });
      return;
    }

    async function exchange(handoffCode: string) {
      try {
        const response = await adminRequest<unknown>('/api/v1/auth/sso/exchange', {
          method: 'POST',
          body: JSON.stringify({ code: handoffCode }),
        });
        const parsed = TokenPairSchema.safeParse(response);
        if (!parsed.success) {
          setState({ status: 'error', message: 'Phản hồi đăng nhập không hợp lệ.' });
          return;
        }
        if (!hasAdminAccess(parsed.data.user.role)) {
          setState({
            status: 'error',
            message: 'Tài khoản này không có quyền truy cập bảng điều khiển quản trị.',
          });
          return;
        }
        setAdminSession(parsed.data);
        navigate('/', { replace: true });
      } catch (caught) {
        setState({
          status: 'error',
          message: caught instanceof Error ? caught.message : 'Không thể xác thực phiên quản trị.',
        });
      }
    }

    void exchange(code);
  }, [code, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-soft">
        {state.status === 'pending' ? (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
            <h1 className="mt-4 text-lg font-semibold text-slate-900">
              Đang xác thực phiên quản trị
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Cổng đăng nhập đã xác nhận tài khoản của bạn. Vui lòng chờ trong giây lát…
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-2xl">
              ⛔
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">
              Không thể mở bảng điều khiển
            </h1>
            <p className="mt-2 text-sm text-slate-600">{state.message}</p>
            <a
              href={`${env.portalUrl}/login?next=admin`}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Quay lại cổng đăng nhập
            </a>
          </>
        )}
      </div>
    </div>
  );
}
