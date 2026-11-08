import type { Db } from '../db/tx.js';
import { AppError } from '../http/errors.js';

export interface CharacterRef {
  id: string;
  user_id: string;
  full_name: string;
  cash_minor: string;
  credit_score: number;
  heat_level: number;
  health_energy: number;
  marital_status: string;
  spouse_id: string | null;
}

/** Resolve the caller's character. Core endpoints operate on the actor, not an id. */
export async function requireCharacterByUserId(db: Db, userId: string): Promise<CharacterRef> {
  const result = await db.query<CharacterRef>(
    `SELECT id, user_id, full_name, cash_minor, credit_score, heat_level, health_energy,
            marital_status, spouse_id
     FROM characters WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId],
  );
  const character = result.rows[0];
  if (!character) throw AppError.notFound('Character');
  return character;
}

export async function requireCharacterById(db: Db, characterId: string): Promise<CharacterRef> {
  const result = await db.query<CharacterRef>(
    `SELECT id, user_id, full_name, cash_minor, credit_score, heat_level, health_energy,
            marital_status, spouse_id
     FROM characters WHERE id = $1`,
    [characterId],
  );
  const character = result.rows[0];
  if (!character) throw AppError.notFound('Character');
  return character;
}
