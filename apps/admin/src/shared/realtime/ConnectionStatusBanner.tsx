import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminSocket } from './socket';

type ConnState = 'connected' | 'reconnecting' | 'failed';

export function ConnectionStatusBanner() {
  const qc = useQueryClient();
  const [state, setState] = useState<ConnState>('connected');
  const [synced, setSynced] = useState(false);
  const wasDisconnectedRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const socket = getAdminSocket();
    const manager = socket.io;

    const showSynced = () => {
      setSynced(true);
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => setSynced(false), 3000);
    };

    const refreshAfterReconnect = () => {
      void qc.invalidateQueries({ queryKey: ['admin-chat'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['broadcasts'] });
      void qc.invalidateQueries({ queryKey: ['game-config'] });
      void qc.invalidateQueries({ queryKey: ['admin'] });
    };

    const onConnect = () => {
      setState('connected');
      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false;
        showSynced();
        refreshAfterReconnect();
      }
    };
    const onDisconnect = (reason: string) => {
      if (reason === 'io client disconnect') return;
      wasDisconnectedRef.current = true;
      setSynced(false);
      setState('reconnecting');
    };
    const onConnectError = () => {
      if (!wasDisconnectedRef.current && socket.active) return;
      wasDisconnectedRef.current = true;
      setState((s) => (s === 'failed' ? 'failed' : 'reconnecting'));
    };
    const onReconnectAttempt = () => {
      wasDisconnectedRef.current = true;
      setSynced(false);
      setState((s) => (s === 'failed' ? 'failed' : 'reconnecting'));
    };
    const onReconnectFailed = () => {
      wasDisconnectedRef.current = true;
      setSynced(false);
      setState('failed');
    };

    if (!socket.connected && socket.active) {
      wasDisconnectedRef.current = true;
      setState('reconnecting');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    manager.on('reconnect_attempt', onReconnectAttempt);
    manager.on('reconnect_failed', onReconnectFailed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      manager.off('reconnect_attempt', onReconnectAttempt);
      manager.off('reconnect_failed', onReconnectFailed);
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    };
  }, [qc]);

  if (state === 'connected' && !synced) return null;

  if (state === 'connected' && synced) {
    return (
      <div className="flex w-full items-center justify-center gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
        <span>Đã đồng bộ lại dữ liệu</span>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div className="flex w-full flex-wrap items-center justify-center gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
        <span>Không thể kết nối tự động</span>
        <button
          type="button"
          onClick={() => {
            const socket = getAdminSocket();
            try { socket.connect(); } catch { /* ignore */ }
            setState('reconnecting');
            wasDisconnectedRef.current = true;
          }}
          className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
        >
          Kết nối lại ngay
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
      <span>Mất kết nối máy chủ. Đang tự động kết nối lại...</span>
    </div>
  );
}