import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionUser } from '@efls/contracts';

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  setSession: (session: { accessToken: string; refreshToken: string; user: SessionUser }) => void;
  clearSession: () => void;
}

type AuthSyncMessage =
  | { type: 'session'; payload: { accessToken: string; refreshToken: string; user: SessionUser } }
  | { type: 'clear' };

const authChannel: BroadcastChannel | null =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('efls_auth_sync')
    : null;

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) => {
        set({ accessToken, refreshToken, user });
        try { authChannel?.postMessage({ type: 'session', payload: { accessToken, refreshToken, user } } satisfies AuthSyncMessage); } catch { /* ignore */ }
      },
      clearSession: () => {
        set({ accessToken: null, refreshToken: null, user: null });
        try { authChannel?.postMessage({ type: 'clear' } satisfies AuthSyncMessage); } catch { /* ignore */ }
      },
    }),
    { name: 'efls.session' },
  ),
);

// Đồng bộ phiên đăng nhập / refresh token / đăng xuất / khóa tài khoản giữa các tab
if (typeof window !== 'undefined') {
  const syncFromStorage = () => {
    try { void useSessionStore.persist.rehydrate(); } catch { /* ignore */ }
  };
  window.addEventListener('storage', (e) => {
    if (e.key === 'efls.session') syncFromStorage();
  });
  authChannel?.addEventListener('message', (e: MessageEvent<AuthSyncMessage>) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'session' && msg.payload?.accessToken && msg.payload?.refreshToken && msg.payload?.user) {
      useSessionStore.setState({
        accessToken: msg.payload.accessToken,
        refreshToken: msg.payload.refreshToken,
        user: msg.payload.user,
      });
    } else if (msg.type === 'clear') {
      useSessionStore.setState({ accessToken: null, refreshToken: null, user: null });
    }
  });
}
