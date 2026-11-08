import { Rooms } from '@efls/contracts';
import type { SocketActor } from './types.js';

const ALLOWED_PATTERNS = [
  /^city_map_room:[\w-]+$/,
  /^stock_market_room$/,
  /^ticker_room:[\w-]+$/,
  /^chat_room:[\w-]+$/,
  /^courtroom_session:[\w-]+$/,
  /^character_room:[\w-]+$/,
  /^admin_room$/,
  /^election_room:[\w-]+$/,
];

/**
 * Never trust a client-provided room name. The server decides what the actor
 * is allowed to join; courtroom membership will be checked against the case.
 */
export function canJoinRoom(actor: SocketActor, room: string): boolean {
  if (room === Rooms.admin()) {
    return actor.role === 'admin' || actor.role === 'moderator';
  }
  if (room === Rooms.character(actor.id)) {
    return true;
  }
  if (room.startsWith('character_room:')) {
    return false;
  }
  return ALLOWED_PATTERNS.some((pattern) => pattern.test(room));
}
