import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface NpcRow {
  id: string;
  npcId: string;
  personality: string;
  dialogue: string;
  accept: boolean;
  counterOfferMinor: string | null;
  moodDelta: string;
  createdAt: Date;
}

/** Truy cập đàm phán NPC. */
export class NpcRepository {
  constructor(readonly db: Db = pool) {}

  async insertNegotiation(
    client: Db,
    characterId: string,
    npcId: string,
    personality: string,
    context: string,
    playerOffer: string,
    fairValue: number,
    dialogue: string,
    accept: boolean,
    counterOfferMinor: number | null,
    moodDelta: number,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO npc_negotiations
         (id, character_id, npc_id, personality, context, player_offer, fair_value,
          dialogue, accept, counter_offer, mood_delta)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        characterId,
        npcId,
        personality,
        context,
        playerOffer,
        fairValue,
        dialogue,
        accept,
        counterOfferMinor,
        moodDelta,
      ],
    );
    return result.rows[0]!.id;
  }

  async listHistory(characterId: string, db: Db = this.db): Promise<NpcRow[]> {
    const result = await db.query<NpcRow>(
      `SELECT id, npc_id AS "npcId", personality, dialogue, accept,
              counter_offer AS "counterOfferMinor", mood_delta AS "moodDelta",
              created_at AS "createdAt"
       FROM npc_negotiations WHERE character_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [characterId],
    );
    return result.rows;
  }
}

export const npcRepository = new NpcRepository();
