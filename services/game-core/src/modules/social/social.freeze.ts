import type { Db } from '../../shared/db/tx.js';
import { AppError } from '../../shared/http/errors.js';
import { pool } from '../../shared/db/pool.js';

export async function hasPendingDivorce(characterId: string, db: Db = pool): Promise<boolean> {
  const res = await db.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM divorce_proposals d
     JOIN marriage_contracts m ON m.id = d.marriage_id
     WHERE d.status = 'pending' AND (m.character_id = $1 OR m.spouse_id = $1)
     LIMIT 1`,
    [characterId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function assertNoPendingDivorce(characterId: string, db: Db = pool): Promise<void> {
  if (await hasPendingDivorce(characterId, db)) {
    throw AppError.conflict(
      'divorce_pending_freeze',
      'Tài sản đang bị phong tỏa do có yêu cầu ly hôn đang chờ xử lý. Không thể thực hiện giao dịch này.',
    );
  }
}
