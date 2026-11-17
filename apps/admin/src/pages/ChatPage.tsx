import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useChatSocket, useAdminToasts, type UiChatMessage, type SearchUser } from '../features/chat/useChatSocket';

function timeLabel(iso: string) { try { return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
function isStaff(role?: string) { return role === 'admin' || role === 'moderator'; }
function initials(name: string) { const parts = (name || '').trim().split(/\s+/).filter(Boolean); if (!parts.length) return '?'; const first = parts[0] ?? '?'; const last = parts[parts.length - 1] ?? first; return (parts.length === 1 ? first.slice(0, 2) : `${first[0] ?? ''}${last[0] ?? ''}`).toUpperCase() || '?'; }
function RoleBadge({ role }: { role?: string }) { if (!isStaff(role)) return null; return <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">[Quản trị viên]</span>; }

function Toasts() {
  const toasts = useAdminToasts();
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[200] space-y-2">
      {toasts.map((t) => (
        <div key={t.id} className={clsx('pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-lg', t.variant === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : t.variant === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-800')}>
          <div className="font-semibold">{t.title}</div>
          {t.description && <div className="text-xs opacity-90">{t.description}</div>}
        </div>
      ))}
    </div>
  );
}

function MessageList({ messages, myUserId }: { messages: UiChatMessage[]; myUserId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, messages[messages.length - 1]?.id]);
  const groups: UiChatMessage[][] = [];
  for (const m of messages) { const last = groups[groups.length - 1]; if (last && last[0] && last[0].senderId === m.senderId) last.push(m); else groups.push([m]); }
  return (
    <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
      {messages.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-500">Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!</div>
      ) : groups.map((g, gi) => {
        const first = g[0]!; const mine = first.senderId === myUserId; const name = mine ? 'Bạn' : (first.senderName || 'Người dùng');
        return (
          <div key={gi} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
            <div className={clsx('max-w-[75%]')}>
              {!mine && <div className="mb-1 flex items-center gap-1 px-1 text-[10px] font-semibold text-slate-600"><span>{name}</span><RoleBadge role={first.senderRole} /></div>}
              <div className="space-y-1">
                {g.map((m) => (
                  <div key={m.id || m.clientMsgId} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div className={clsx('rounded-2xl px-3 py-2 text-sm shadow-sm', mine ? 'rounded-br-md bg-emerald-500 text-white' : 'rounded-bl-md bg-white text-slate-800', m.localStatus === 'error' && 'opacity-60 ring-1 ring-rose-300')}>
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      <div className={clsx('mt-0.5 text-[10px]', mine ? 'text-emerald-100' : 'text-slate-400')}>{timeLabel(m.createdAt)}{m.localStatus === 'sending' ? ' · đang gửi' : m.localStatus === 'error' ? ' · lỗi' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

export function ChatPage() {
  const chat = useChatSocket();
  const [tab, setTab] = useState<'public' | 'private'>('public');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!search.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      void chat.searchUsers(search)
        .then((r) => { if (alive) setSearchResults(r); })
        .catch(() => { if (alive) setSearchResults([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [search, chat]);

  const activePeer = useMemo(() => chat.conversations.find(c => c.peerUserId === chat.activePeerId) || null, [chat.conversations, chat.activePeerId]);
  const activeMessages = chat.activePeerId ? (chat.privateMessagesByPeer[chat.activePeerId] ?? []) : [];

  function sendCurrent() {
    const text = draft.trim(); if (!text) return;
    if (tab === 'public') chat.sendGlobal(text);
    else if (chat.activePeerId) chat.sendPrivate(chat.activePeerId, text);
    setDraft('');
  }

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col space-y-3">
      <Toasts />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Chat hệ thống</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className={clsx('h-2.5 w-2.5 rounded-full', chat.connected ? 'bg-emerald-500' : 'bg-slate-300')} />
          <span className="text-slate-600">{chat.connected ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('public')} className={clsx('rounded-xl px-3 py-1.5 text-xs font-semibold transition', tab === 'public' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>Chat tổng</button>
        <button type="button" onClick={() => setTab('private')} className={clsx('rounded-xl px-3 py-1.5 text-xs font-semibold transition', tab === 'private' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
          Riêng tư {chat.totalPrivateUnread > 0 ? <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{chat.totalPrivateUnread}</span> : null}
        </button>
      </div>

      {tab === 'public' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <MessageList messages={chat.globalMessages} myUserId={chat.myUserId} />
          <div className="border-t border-slate-200 bg-white p-3">
            <div className="flex gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendCurrent(); }} placeholder="Nhắn tới Chat tổng..." className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-300" />
              <button type="button" onClick={sendCurrent} disabled={!draft.trim()} className="rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition disabled:opacity-50 hover:brightness-105">Gửi</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'private' && (
        <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-0 flex-col border-r border-slate-200">
            <div className="border-b border-slate-100 p-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, username, ID hoặc CCCD..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-300" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {search.trim() ? (
                <div>
                  {searching && <div className="p-3 text-xs text-slate-500">Đang tìm...</div>}
                  {!searching && searchResults.length === 0 && <div className="p-3 text-xs text-slate-500">Không tìm thấy người dùng.</div>}
                  {searchResults.map((u) => (
                    <button key={u.id} type="button" onClick={() => { chat.setActivePeerId(u.id); setSearch(''); setSearchResults([]); }} className={clsx('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50', chat.activePeerId === u.id && 'bg-slate-100')}>
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{initials(u.displayName)}<span className={clsx('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white', u.isOnline ? 'bg-emerald-500' : 'bg-slate-300')} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center truncate text-sm font-medium text-slate-800">{u.displayName}{isStaff(u.role) && <RoleBadge role={u.role} />}</div>
                        <div className="truncate text-[11px] text-slate-500">{u.username ? `@${u.username}` : 'Người dùng'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  {chat.conversations.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">Chưa có hội thoại. Tìm người để bắt đầu.</div>
                  ) : chat.conversations.map((c) => (
                    <button key={c.peerUserId} type="button" onClick={() => chat.setActivePeerId(c.peerUserId)} className={clsx('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50', chat.activePeerId === c.peerUserId && 'bg-slate-100')}>
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{initials(c.displayName)}<span className={clsx('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white', c.isOnline ? 'bg-emerald-500' : 'bg-slate-300')} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center truncate text-sm font-medium text-slate-800">{c.displayName}{isStaff(c.role) && <RoleBadge role={c.role} />}</div>
                          {c.lastAt && <div className="shrink-0 text-[10px] text-slate-400">{timeLabel(c.lastAt)}</div>}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-[11px] text-slate-500">{c.lastMessage || 'Bắt đầu trò chuyện'}</div>
                          {c.unreadCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{c.unreadCount}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            {chat.activePeerId ? (
              <>
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{activePeer?.displayName || chat.activePeerId.slice(0, 8)}</span>
                    {activePeer && isStaff(activePeer.role) && <RoleBadge role={activePeer.role} />}
                    <span className={clsx('h-2 w-2 rounded-full', activePeer?.isOnline ? 'bg-emerald-500' : 'bg-slate-300')} />
                  </div>
                  <div className="text-[11px] text-slate-500">{activePeer?.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}</div>
                </div>
                <MessageList messages={activeMessages} myUserId={chat.myUserId} />
                <div className="border-t border-slate-200 bg-white p-3">
                  <div className="flex gap-2">
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendCurrent(); }} placeholder="Nhắn riêng..." className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-300" />
                    <button type="button" onClick={sendCurrent} disabled={!draft.trim()} className="rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition disabled:opacity-50 hover:brightness-105">Gửi</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Chọn một hội thoại hoặc tìm người dùng để bắt đầu chat riêng.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
