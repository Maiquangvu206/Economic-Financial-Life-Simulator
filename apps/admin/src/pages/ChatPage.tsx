import { useEffect, useMemo, useRef, useState } from 'react';
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
];

let msgSeq = 0;

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function ChatPage() {
  const session = useAdminSession();
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');
  const [activeChannel, setActiveChannel] = useState<string>('global');
  const [activePrivateCharId, setActivePrivateCharId] = useState<string>('');
  const [dmChannelByChar, setDmChannelByChar] = useState<Record<string, string>>({});
  const [dmLabelByChar, setDmLabelByChar] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [newDmTarget, setNewDmTarget] = useState('');
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingSendRef = useRef<{ channelId: string; message: string } | null>(null);

  const myUserId = session?.user?.id ?? '';
  const myName = session?.user?.username ?? session?.user?.email ?? 'Quản trị viên';
  const myDisplayName = session?.user?.username?.trim() || session?.user?.email?.split('@')[0] || 'Quản trị viên';

  const privateChannelId = activePrivateCharId
    ? (dmChannelByChar[activePrivateCharId] ?? `private:${activePrivateCharId}`)
    : '';
  const currentChannelId = activeTab === 'private' ? privateChannelId : activeChannel;
  const currentChannelIdRef = useRef(currentChannelId);
  useEffect(() => {
    currentChannelIdRef.current = currentChannelId;
  }, [currentChannelId]);

  const privateThreadCharIds = useMemo(() => Object.keys(dmChannelByChar), [dmChannelByChar]);
  const messages = threads[currentChannelId] ?? [];

  useEffect(() => {
    const socket = getAdminSocket();

    const joinPublicRooms = () => {
      for (const ch of PUBLIC_CHANNELS) {
        socket.emit('room:join', { room: `chat_room:${ch.id}` });
      }
    };

    const onConnect = () => {
      setConnected(true);
      setConnError(null);
      joinPublicRooms();
      if (pendingSendRef.current) {
        const m = pendingSendRef.current;
        pendingSendRef.current = null;
        socket.emit('chat:send', { ...m, displayName: myDisplayName });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err: any) => {
      setConnected(false);
      setConnError(err?.message || 'Không kết nối được realtime');
    };
    const onMessage = (msg: ChatMessage) => {
      const id = `${msg.at}-${msg.characterId}-${++msgSeq}`;
      // Tin nhắn riêng gửi tới mình: channelId = private:<myUserId>, gom vào thread theo người gửi
      let threadKey = msg.channelId;
      if (msg.fromPrivate && msg.toCharacterId === myUserId && msg.characterId !== myUserId) {
        const sender = msg.characterId;
        threadKey = `private:${sender}`;
        setDmChannelByChar((prev) => (prev[sender] ? prev : { ...prev, [sender]: `private:${sender}` }));
        setDmLabelByChar((prev) => (prev[sender] ? prev : { ...prev, [sender]: msg.displayName || sender.slice(0, 8) }));
      }
      setThreads((prev) => ({
        ...prev,
        [threadKey]: [...(prev[threadKey] ?? []), { ...msg, id }],
      }));
    };

    if (socket.connected) {
      setConnected(true);
      joinPublicRooms();
    }
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('chat:message', onMessage as never);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('chat:message', onMessage as never);
    };
  }, [myUserId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, currentChannelId]);

  async function openDm(targetRaw: string) {
    const raw = targetRaw.trim();
    if (!raw) return;
    let charId = raw;
    let label = raw;
    if (/^\d{12}$/.test(raw)) {
      try {
        const resolved = await adminRequest<{ id: string; fullName?: string }>(`/api/v1/characters/by-cccd/${raw}`);
        charId = resolved.id;
        label = resolved.fullName ? `${resolved.fullName} (${raw})` : raw;
      } catch {
        setConnError('Không tìm thấy nhân vật với CCCD này.');
        return;
      }
    }
    setActiveTab('private');
    setNewDmTarget('');
    if (dmChannelByChar[charId]) {
      setActivePrivateCharId(charId);
      return;
    }
    try {
      const resolved = await adminRequest<{ userId: string; fullName?: string }>(`/api/v1/characters/${charId}`);
      setDmChannelByChar((prev) => ({ ...prev, [charId]: `private:${resolved.userId}` }));
      if (resolved.fullName) label = resolved.fullName;
    } catch {
      // fallback: dùng chính id làm target (có thể là userId)
      setDmChannelByChar((prev) => ({ ...prev, [charId]: `private:${charId}` }));
    }
    setDmLabelByChar((prev) => ({ ...prev, [charId]: label }));
    setActivePrivateCharId(charId);
  }

  function send() {
    const trimmed = draft.trim();
    if (!trimmed || !currentChannelId) return;
    const socket = getAdminSocket();
    if (!socket.connected) {
      pendingSendRef.current = { channelId: currentChannelId, message: trimmed };
      socket.connect();
      setDraft('');
      return;
    }
    socket.emit('chat:send', { channelId: currentChannelId, message: trimmed, displayName: myDisplayName });
    setDraft('');
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Chat hệ thống</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-semibold ${connected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {connected ? 'Đã kết nối' : 'Chưa kết nối'}
          </span>
          {connError && <span className="text-rose-600">{connError}</span>}
        </div>
      </div>

      <div className="flex gap-2">
        {([
          { key: 'public', label: 'Chat tổng' },
          { key: 'private', label: 'Riêng tư' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              activeTab === tab.key
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'private' && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex gap-2">
            <input
              value={newDmTarget}
              onChange={(e) => setNewDmTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void openDm(newDmTarget); }}
              placeholder="Nhập CCCD (12 số) hoặc Character ID để chat riêng..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-300"
            />
            <button
              type="button"
              onClick={() => void openDm(newDmTarget)}
              className="rounded-xl bg-rose-100 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-200"
            >
              Mở
            </button>
          </div>
          {privateThreadCharIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {privateThreadCharIds.map((tid) => (
                <button
                  key={tid}
                  type="button"
                  title={tid}
                  onClick={() => setActivePrivateCharId(tid)}
                  className={clsx(
                    'rounded-lg px-2 py-1 text-[11px] transition',
                    activePrivateCharId === tid
                      ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {dmLabelByChar[tid] ?? `${tid.slice(0, 8)}…`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-3">
          {messages.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              {activeTab === 'private' && !activePrivateCharId
                ? 'Nhập CCCD hoặc Character ID ở trên để bắt đầu chat riêng.'
                : 'Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!'}
            </div>
          ) : (
            messages.map((m) => {
              const mine = Boolean(myUserId) && m.characterId === myUserId;
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
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder={
                activeTab === 'private'
                  ? (activePrivateCharId ? 'Nhắn riêng...' : 'Chọn/mở cuộc trò chuyện riêng trước...')
                  : 'Nhắn tới Chat tổng...'
              }
              disabled={activeTab === 'private' && !activePrivateCharId}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-300 disabled:bg-slate-100"
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
          <p className="mt-1 text-[10px] text-slate-400">Rate limit 5 tin / 3 giây · Tin nhắn realtime, không lưu lịch sử.</p>
        </div>
      </div>
    </div>
  );
}