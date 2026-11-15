import type { Db } from '../db/tx.js';
import { AppError } from '../http/errors.js';

export interface CharacterRef {
  id: string;
  user_id: string | null;
  full_name: string;
  cccd: string | null;
  birthplace: string | null;
  cash_minor: string;
  credit_score: number;
  heat_level: number;
  health_energy: number;
  is_alive: boolean;
  marital_status: string;
  spouse_id: string | null;
}

const BASE_COLS = `id, user_id, full_name, cccd, birthplace, cash_minor, credit_score, heat_level, health_energy,
  COALESCE(is_alive, true) AS is_alive, marital_status, spouse_id`;

/** Resolve the caller's character (including dead, for succession/state). */
export async function requireCharacterByUserId(db: Db, userId: string): Promise<CharacterRef> {
  const result = await db.query<CharacterRef>(
    `SELECT ${BASE_COLS}
     FROM characters WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  const character = result.rows[0];
  if (!character) throw AppError.notFound('Character');
  return character;
}

export async function requireLivingCharacterByUserId(db: Db, userId: string): Promise<CharacterRef> {
  const character = await requireCharacterByUserId(db, userId);
  if (character.is_alive === false) {
    throw AppError.conflict('character_dead', 'Nhân vật đã qua đời. Vui lòng hoàn tất kế thừa để tiếp tục.');
  }
  return character;
}

export async function requireCharacterById(db: Db, characterId: string): Promise<CharacterRef> {
  const result = await db.query<CharacterRef>(
    `SELECT ${BASE_COLS} FROM characters WHERE id = $1`,
    [characterId],
  );
  const character = result.rows[0];
  if (!character) throw AppError.notFound('Character');
  return character;
}

export async function requireLivingCharacterById(db: Db, characterId: string): Promise<CharacterRef> {
  const character = await requireCharacterById(db, characterId);
  if (character.is_alive === false) {
    throw AppError.conflict('character_dead', 'Nhân vật mục tiêu đã qua đời.');
  }
  return character;
}

export async function resolveCharacterByCccd(db: Db, cccd: string, opts?: { requireAlive?: boolean }): Promise<CharacterRef> {
  const normalized = (cccd || '').replace(/\s+/g, '');
  if (!/^\d{12}$/.test(normalized)) {
    throw AppError.badRequest('CCCD phải gồm đúng 12 chữ số.');
  }
  const result = await db.query<CharacterRef>(
    `SELECT ${BASE_COLS} FROM characters WHERE cccd = $1 LIMIT 1`,
    [normalized],
  );
  const character = result.rows[0];
  if (!character) throw AppError.notFound('Không tìm thấy nhân vật theo CCCD.');
  if (opts?.requireAlive && character.is_alive === false) {
    throw AppError.conflict('character_dead', 'Nhân vật mục tiêu đã qua đời.');
  }
  return character;
}
