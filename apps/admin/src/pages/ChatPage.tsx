import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { getAdminSocket } from '../shared/realtime/socket';
import { adminRequest } from '../shared/api/httpClient';
import { useAdminSession } from '../features/auth/session';

export interface ChatMessage {
  id: string;
  channelId: string;
  characterId: string;
  displayName: string;
  message: string;
  at: number;
  fromPrivate?: boolean;
  toCharacterId?: string;
}

const PUBLIC_CHANNELS: { id: string; label: string }[] = [
  { id: 'global', label: 'Chat tổng' },
  { id: 'hcmc', label: 'Thành phố' },
];

let msgSeq = 0;

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function ChatPage() {
  const session = useAdminSession();
  const [activeChannel, setActiveChannel] = useState<string>('global');
  const [draft, setDraft] = useState('');
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const myName = session?.user?.username ?? session?.user?.email ?? 'Quản trị viên';

  const { data: me } = useQuery<{ id: string }>({
    queryKey: ['characters', 'me-id'],
    queryFn: () => adminRequest<{ id: string }>('/api/v1/characters/me'),
    retry: false,
  });

  useEffect(() => {
    const socket = getAdminSocket();

    const joinPublicRooms = () => {
      for (const ch of PUBLIC_CHANNELS) {
        socket.emit('room:join', { room: `chat_room:${ch.id}` });
      }
    };

    const onConnect = () => joinPublicRooms();
    const onMessage = (msg: ChatMessage) => {
      const id = `${msg.at}-${msg.characterId}-${++msgSeq}`;
      setThreads((prev) => ({
        ...prev,
        [msg.channelId]: [...(prev[msg.channelId] ?? []), { ...msg, id }],
      }));
    };

    if (socket.connected) joinPublicRooms();
    socket.on('connect', onConnect);
    socket.on('chat:message', onMessage as never);
    return () => {
      socket.off('connect', onConnect);
      socket.off('chat:message', onMessage as never);
    };
  }, []);

  const messages = threads[activeChannel] ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeChannel]);

  function send() {
    const trimmed = draft.trim();
    if (!trimmed || !activeChannel) return;
    const socket = getAdminSocket();
    if (!socket.connected) {
      socket.connect();
      return;
    }
    socket.emit('chat:send', { channelId: activeChannel, message: trimmed });
    setDraft('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Chat hệ thống</h1>
      </div>

      <div className="flex gap-2">
        {PUBLIC_CHANNELS.map((ch) => (
          <button
            key={ch.id}
            type="button"
            onClick={() => setActiveChannel(ch.id)}
            className={clsx(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              activeChannel === ch.id
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {ch.label}
          </button>
        ))}
      </div>

      <div className="flex h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-3">
          {messages.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!</div>
          ) : (
            messages.map((m) => {
              const mine = m.characterId === (me?.id ?? '');
              return (
                <div key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={clsx(
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                      mine ? 'rounded-br-md bg-emerald-500 text-white' : 'rounded-bl-md bg-white text-slate-800',
                    )}
                  >
                    <div className={clsx('text-[10px] font-semibold', mine ? 'text-emerald-100' : 'text-slate-500')}>
                      {mine ? myName : (m.displayName ?? 'Người chơi')} · {timeLabel(m.at)}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{m.message}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-200 bg-white p-2">
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
              placeholder={`Nhắn tới ${PUBLIC_CHANNELS.find((c) => c.id === activeChannel)?.label ?? 'chat tổng'}...`}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-300"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              className="rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition disabled:opacity-50 hover:brightness-105"
            >
              Gửi
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Rate limit 5 tin / 3 giây · Tin nhắn realtime, không lưu lịch sử.</p>
        </div>
      </div>
    </div>
  );
}