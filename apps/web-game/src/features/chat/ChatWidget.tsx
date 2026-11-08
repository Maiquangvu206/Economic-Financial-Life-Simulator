import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { getGameSocket } from '../../shared/realtime/socket';
import { apiRequest } from '../../shared/api/httpClient';
import { useSessionStore } from '../auth/sessionStore';

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
  return new Date(at).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Widget chat nổi (góc phải dưới): chat tổng (public rooms) + chat riêng tư (DM 1-1).
 * Tin nhắn realtime qua socket; không lưu bền (session-only history).
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');
  const [activeChannel, setActiveChannel] = useState<string>('global');
  const [activePrivateCharId, setActivePrivateCharId] = useState<string>('');
  const [dmChannelByChar, setDmChannelByChar] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [newDmTarget, setNewDmTarget] = useState('');
  const [unread, setUnread] = useState(0);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const myUserId = useSessionStore((s) => s.user?.id ?? '');
  const myName = useSessionStore((s) => s.user?.username ?? 'Bạn');

  const { data: me } = useQuery<{ id: string }>({
    queryKey: ['characters', 'me-id'],
    queryFn: () => apiRequest<{ id: string }>('/api/v1/characters/me'),
  });

  // Server định tuyến DM qua character_room=<userId>, nên channel dùng userId,
  // còn UI hiển thị thread theo Character ID.
  const privateChannelId = activePrivateCharId
    ? (dmChannelByChar[activePrivateCharId] ?? `private:${activePrivateCharId}`)
    : '';
  const currentChannelId = activeTab === 'private' ? privateChannelId : activeChannel;
  const messages = threads[currentChannelId] ?? [];

  const privateThreadCharIds = useMemo(() => Object.keys(dmChannelByChar), [dmChannelByChar]);

  // Nối socket + lắng nghe chat:message, tự join kênh public.
  useEffect(() => {
    const socket = getGameSocket();
    for (const ch of PUBLIC_CHANNELS) {
      socket.emit('room:join', { room: `chat_room:${ch.id}` });
    }
    const onMessage = (msg: ChatMessage) => {
      const id = `${msg.at}-${msg.characterId}-${++msgSeq}`;
      setThreads((prev) => ({
        ...prev,
        [msg.channelId]: [...(prev[msg.channelId] ?? []), { ...msg, id }],
      }));
      setUnread((n) => n + 1);
    };
    socket.on('chat:message', onMessage as never);
    return () => {
      socket.off('chat:message', onMessage as never);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setUnread(0);
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [open, messages.length]);

  function send() {
    const trimmed = draft.trim();
    if (!trimmed || !currentChannelId) return;
    const socket = getGameSocket();
    socket.emit('chat:send', { channelId: currentChannelId, message: trimmed });
    setDraft('');
  }

  async function openDm(targetCharId: string) {
    const raw = targetCharId.trim();
    if (!raw) return;
    // CCCD 12 chữ số: resolve qua API thành Character ID trước.
    let charId = raw;
    if (/^\d{12}$/.test(raw)) {
      try {
        const resolved = await apiRequest<{ id: string }>(`/api/v1/characters/by-cccd/${raw}`);
        charId = resolved.id;
      } catch {
        return;
      }
    }
    setActiveTab('private');
    setNewDmTarget('');
    if (dmChannelByChar[charId]) {
      setActivePrivateCharId(charId);
      return;
    }
    // Resolve Character ID -> User ID (server định tuyến DM qua room của user).
    try {
      const resolved = await apiRequest<{ userId: string }>(`/api/v1/characters/${charId}`);
      setDmChannelByChar((prev) => ({
        ...prev,
        [charId]: `private:${resolved.userId}`,
      }));
    } catch {
      setDmChannelByChar((prev) => ({ ...prev, [charId]: `private:${charId}` }));
    }
    setActivePrivateCharId(charId);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-white shadow-lg shadow-emerald-500/30 transition hover:brightness-105"
        aria-label="Mở chat"
      >
        <span aria-hidden className="text-lg">
          💬
        </span>
        <span className="text-sm font-semibold">Chat</span>
        {unread > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-emerald-700">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[480px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
            {me?.id && (
              <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500">
                <span className="font-mono break-all">ID của tôi: {me.id.slice(0, 13)}…</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(me.id);
                  }}
                  className="ml-auto shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800 hover:bg-emerald-200"
                >
                  Sao chép
                </button>
              </div>
            )}
            <div className="flex gap-2">
              {(
                [
                  { key: 'public', label: 'Chat tổng' },
                  { key: 'private', label: 'Riêng tư' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={clsx(
                    'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                    activeTab === tab.key
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {tab.label}
                  {tab.key === 'private' && privateThreadCharIds.length > 0 && (
                    <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-[10px] text-rose-700">
                      {privateThreadCharIds.length}
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto rounded-lg px-2 text-slate-500 hover:bg-slate-100"
                aria-label="Đóng chat"
              >
                ✕
              </button>
            </div>

            {activeTab === 'public' && (
              <div className="mt-2 flex gap-1">
                {PUBLIC_CHANNELS.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setActiveChannel(ch.id)}
                    className={clsx(
                      'rounded-lg px-2 py-1 text-[11px] font-medium transition',
                      activeChannel === ch.id
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'private' && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1 overflow-x-auto">
                  {privateThreadCharIds.map((tid) => (
                    <button
                      key={tid}
                      type="button"
                      title={tid}
                      onClick={() => setActivePrivateCharId(tid)}
                      className={clsx(
                        'whitespace-nowrap rounded-lg px-2 py-1 font-mono text-[11px] transition',
                        activePrivateCharId === tid
                          ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {tid.slice(0, 8)}…
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newDmTarget}
                    onChange={(e) => setNewDmTarget(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openDm(newDmTarget);
                    }}
                    placeholder="Nhập CCCD (12 số) hoặc Character ID để chat riêng..."
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-emerald-300"
                  />
                  <button
                    type="button"
                    onClick={() => openDm(newDmTarget)}
                    className="rounded-lg bg-rose-100 px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-200"
                  >
                    Mở
                  </button>
                </div>
              </div>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-3">
            {messages.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                {activeTab === 'private' && !activePrivateCharId
                  ? 'Nhập Character ID ở trên để bắt đầu chat riêng.'
                  : 'Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!'}
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.characterId === myUserId;
                return (
                  <div key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={clsx(
                        'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                        mine
                          ? 'rounded-br-md bg-emerald-500 text-white'
                          : 'rounded-bl-md bg-white text-slate-800',
                      )}
                    >
                      <div
                        className={clsx(
                          'text-[10px] font-semibold',
                          mine ? 'text-emerald-100' : 'text-slate-500',
                        )}
                      >
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
                placeholder={
                  activeTab === 'private'
                    ? 'Nhắn riêng...'
                    : `Nhắn tới ${PUBLIC_CHANNELS.find((c) => c.id === activeChannel)?.label ?? 'chat tổng'}...`
                }
                disabled={activeTab === 'private' && !activePrivateCharId}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-300"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() || (activeTab === 'private' && !activePrivateCharId)}
                className="rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition disabled:opacity-50 hover:brightness-105"
              >
                Gửi
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Rate limit 5 tin / 3 giây · Tin nhắn realtime, không lưu lịch sử.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
