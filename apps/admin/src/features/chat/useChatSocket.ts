import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChatAck, ChatMessage as WireMessage } from '@efls/contracts';
import { getAdminSocket } from '../../shared/realtime/socket';
import { adminRequest } from '../../shared/api/httpClient';
import { useAdminSession } from '../auth/session';

export type UiChatMessage = WireMessage & { localStatus?: 'sending' | 'sent' | 'error' };
export interface Conversation { peerUserId: string; displayName: string; role: string; isOnline: boolean; lastMessage: string | null; lastAt: string | null; unreadCount: number; }
export interface SearchUser { id: string; displayName: string; username?: string; role: string; characterId?: string | null; isOnline?: boolean; }

function uuid() { return crypto.randomUUID(); }

function normIncoming(msg: any): UiChatMessage | null {
  if (!msg) return null;
  if (msg.channel === 'global' || msg.channel === 'private') return { ...(msg as WireMessage), localStatus: 'sent' };
  if (typeof msg.channelId === 'string') {
    const isPrivate = !!msg.fromPrivate || msg.channelId.startsWith('private:');
    const createdAt = msg.at ? new Date(msg.at).toISOString() : new Date().toISOString();
    return {
      id: msg.id || `${createdAt}-${msg.characterId || 'x'}`,
      clientMsgId: msg.clientMsgId,
      channel: isPrivate ? 'private' : 'global',
      senderId: msg.characterId || '',
      senderName: msg.displayName || 'Người dùng',
      senderRole: msg.senderRole || 'player',
      receiverId: msg.toCharacterId ?? (isPrivate ? msg.channelId.replace('private:', '') : null),
      content: msg.message || '',
      createdAt,
      localStatus: 'sent',
    };
  }
  return null;
}

// simple toast bus for admin
type Toast = { id: string; title: string; description?: string; variant?: 'error'|'warning'|'info'|'success' };
type Listener = (t: Toast[]) => void;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();
function emitToasts() { for (const l of listeners) l(toasts); }
export function pushAdminToast(t: Omit<Toast,'id'>) {
  const id = uuid();
  toasts = [...toasts, { ...t, id }];
  emitToasts();
  setTimeout(() => { toasts = toasts.filter(x => x.id !== id); emitToasts(); }, 3500);
}
export function useAdminToasts() {
  const [state, setState] = useState<Toast[]>(toasts);
  useEffect(() => { const l: Listener = (v) => setState(v); listeners.add(l); setState(toasts); return () => { listeners.delete(l); }; }, []);
  return state;
}

export function useChatSocket() {
  const session = useAdminSession();
  const myUserId = session?.user?.id ?? '';
  const [connected, setConnected] = useState(false);
  const [globalMessages, setGlobalMessages] = useState<UiChatMessage[]>([]);
  const [privateMessagesByPeer, setPrivateMessagesByPeer] = useState<Record<string, UiChatMessage[]>>({});
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [unreadByPeer, setUnreadByPeer] = useState<Record<string, number>>({});
  const [knownPeers, setKnownPeers] = useState<Record<string, { displayName: string; role: string }>>({});
  const myUserIdRef = useRef(myUserId);
  const activePeerIdRef = useRef<string | null>(null);
  useEffect(() => { myUserIdRef.current = myUserId; }, [myUserId]);
  useEffect(() => { activePeerIdRef.current = activePeerId; }, [activePeerId]);

  const { data: conversationsApi = [], refetch: refetchConversations } = useQuery<Conversation[]>({
    queryKey: ['admin-chat', 'conversations'],
    queryFn: () => adminRequest<Conversation[]>('/api/v1/chat/conversations'),
    refetchInterval: 30_000,
  });

  const upsertMessage = useCallback((incoming: UiChatMessage, opts?: { countUnread?: boolean }) => {
    const apply = (list: UiChatMessage[]) => {
      const idx = list.findIndex((m) => (incoming.id && m.id === incoming.id) || (incoming.clientMsgId && m.clientMsgId && m.clientMsgId === incoming.clientMsgId));
      if (idx >= 0) { const next = list.slice(); const prev = next[idx]!; next[idx] = { ...prev, ...incoming, localStatus: incoming.localStatus ?? prev.localStatus ?? 'sent' }; return next; }
      return [...list, incoming];
    };
    if (incoming.channel === 'global') { setGlobalMessages(apply); return; }
    const me = myUserIdRef.current;
    const peerId = incoming.senderId === me ? (incoming.receiverId || '') : incoming.senderId;
    if (!peerId) return;
    setPrivateMessagesByPeer((prev) => ({ ...prev, [peerId]: apply(prev[peerId] ?? []) }));
    setKnownPeers((prev) => incoming.senderId !== me ? { ...prev, [peerId]: { displayName: incoming.senderName, role: incoming.senderRole } } : prev);
    if (opts?.countUnread && incoming.senderId !== me && activePeerIdRef.current !== peerId) {
      setUnreadByPeer((prev) => ({ ...prev, [peerId]: (prev[peerId] ?? 0) + 1 }));
    }
  }, []);

  useEffect(() => {
    const socket = getAdminSocket();
    const onConnect = () => { setConnected(true); socket.emit('room:join', { room: 'chat_room:global' } as any); };
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setConnected(false);
    const onRateLimited = (p: { message: string }) => pushAdminToast({ variant: 'warning', title: 'Chat', description: p?.message || 'Bạn đang gửi quá nhanh. Vui lòng chờ một chút.' });
    const handle = (raw: any, countUnread?: boolean) => { const msg = normIncoming(raw); if (msg) upsertMessage(msg, { countUnread }); };
    const onGlobal = (m: any) => handle(m, false);
    const onPrivate = (m: any) => handle(m, true);
    const onLegacy = (m: any) => handle(m, true);
    if (socket.connected) onConnect();
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('chat:global', onGlobal as any);
    socket.on('chat:private', onPrivate as any);
    socket.on('chat:message', onLegacy as any);
    socket.on('chat:rate_limited', onRateLimited as any);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('chat:global', onGlobal as any);
      socket.off('chat:private', onPrivate as any);
      socket.off('chat:message', onLegacy as any);
      socket.off('chat:rate_limited', onRateLimited as any);
    };
  }, [upsertMessage]);

  const sendGlobal = useCallback((content: string) => {
    const text = content.trim(); if (!text) return;
    const socket = getAdminSocket();
    if (!socket.connected) { pushAdminToast({ variant: 'warning', title: 'Chat', description: 'Chưa kết nối realtime. Vui lòng đợi kết nối lại.' }); socket.connect(); return; }
    const clientMsgId = uuid();
    const optimistic: UiChatMessage = { id: `tmp-${clientMsgId}`, clientMsgId, channel: 'global', senderId: myUserIdRef.current, senderName: '', senderRole: '', receiverId: null, content: text, createdAt: new Date().toISOString(), localStatus: 'sending' };
    upsertMessage(optimistic);
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      upsertMessage({ ...optimistic, localStatus: 'error' });
      pushAdminToast({ variant: 'error', title: 'Chat', description: 'Gửi tin nhắn quá thời gian chờ. Vui lòng kiểm tra kết nối.' });
    }, 10_000);
    socket.emit('chat:global', { content: text, clientMsgId } as any, (ack: ChatAck) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (ack && ack.ok) upsertMessage({ ...optimistic, id: ack.id, createdAt: ack.createdAt, localStatus: 'sent' });
      else { upsertMessage({ ...optimistic, localStatus: 'error' }); pushAdminToast({ variant: 'error', title: 'Chat', description: (ack as any)?.error === 'rate_limited' ? 'Bạn đang gửi quá nhanh. Vui lòng chờ một chút.' : 'Không gửi được tin nhắn.' }); }
    });
  }, [upsertMessage]);

  const sendPrivate = useCallback((receiverId: string, content: string) => {
    const text = content.trim(); if (!text || !receiverId) return;
    const socket = getAdminSocket();
    if (!socket.connected) { pushAdminToast({ variant: 'warning', title: 'Chat', description: 'Chưa kết nối realtime. Vui lòng đợi kết nối lại.' }); socket.connect(); return; }
    const clientMsgId = uuid();
    const optimistic: UiChatMessage = { id: `tmp-${clientMsgId}`, clientMsgId, channel: 'private', senderId: myUserIdRef.current, senderName: '', senderRole: '', receiverId, content: text, createdAt: new Date().toISOString(), localStatus: 'sending' };
    upsertMessage(optimistic);
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      upsertMessage({ ...optimistic, localStatus: 'error' });
      pushAdminToast({ variant: 'error', title: 'Chat', description: 'Gửi tin nhắn quá thời gian chờ. Vui lòng kiểm tra kết nối.' });
    }, 10_000);
    socket.emit('chat:private', { receiverId, content: text, clientMsgId } as any, (ack: ChatAck) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (ack && ack.ok) { upsertMessage({ ...optimistic, id: ack.id, createdAt: ack.createdAt, localStatus: 'sent' }); void adminRequest('/api/v1/chat/conversations/read', { method: 'POST', body: JSON.stringify({ peerUserId: receiverId }) }).catch(() => {}); }
      else { upsertMessage({ ...optimistic, localStatus: 'error' }); pushAdminToast({ variant: 'error', title: 'Chat', description: (ack as any)?.error === 'rate_limited' ? 'Bạn đang gửi quá nhanh. Vui lòng chờ một chút.' : 'Không gửi được tin nhắn.' }); }
    });
  }, [upsertMessage]);

  const openConversation = useCallback((peerUserId: string) => {
    setActivePeerId(peerUserId);
    setUnreadByPeer((prev) => ({ ...prev, [peerUserId]: 0 }));
    void adminRequest('/api/v1/chat/conversations/read', { method: 'POST', body: JSON.stringify({ peerUserId }) }).catch(() => {});
  }, []);

  const conversations = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const c of conversationsApi) map.set(c.peerUserId, { ...c });
    for (const [peerId, msgs] of Object.entries(privateMessagesByPeer)) {
      const last = msgs[msgs.length - 1];
      const existing = map.get(peerId);
      const peerInfo = knownPeers[peerId];
      const base: Conversation = existing ?? { peerUserId: peerId, displayName: peerInfo?.displayName || peerId.slice(0, 8), role: peerInfo?.role || 'player', isOnline: false, lastMessage: null, lastAt: null, unreadCount: 0 };
      if (last && (!base.lastAt || last.createdAt >= base.lastAt)) { base.lastMessage = last.content; base.lastAt = last.createdAt; }
      base.unreadCount = unreadByPeer[peerId] ?? base.unreadCount ?? 0;
      if (peerInfo?.displayName) base.displayName = peerInfo.displayName;
      if (peerInfo?.role) base.role = peerInfo.role;
      map.set(peerId, base);
    }
    return Array.from(map.values()).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
  }, [conversationsApi, privateMessagesByPeer, knownPeers, unreadByPeer]);

  const totalPrivateUnread = useMemo(() => conversations.reduce((s, c) => s + (c.unreadCount || 0), 0), [conversations]);
  const searchUsers = useCallback(async (q: string): Promise<SearchUser[]> => q.trim() ? adminRequest<SearchUser[]>(`/api/v1/chat/search-users?q=${encodeURIComponent(q.trim())}`) : [], []);

  return { myUserId, connected, globalMessages, privateMessagesByPeer, conversations, activePeerId, setActivePeerId: (id: string | null) => { if (id) openConversation(id); else setActivePeerId(null); }, openConversation, totalPrivateUnread, sendGlobal, sendPrivate, searchUsers, refetchConversations };
}
