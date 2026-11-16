import { pool } from '../../shared/db/pool.js';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction, type Db } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_GOVERNMENT_ID } from '../../shared/ledger/ledger.service.js';
import { writeActionLog } from '../../shared/audit/actionLog.js';
import type {
  GiftCodeDto,
  GiftCodeRedemptionDto,
  MyGiftCodeRedemptionDto,
  RedeemGiftCodeRequest,
  RedeemGiftCodeResponse,
  UpsertGiftCodeRequest,
} from '@efls/contracts';

function money(amount: number) {
  return { amount, currency: 'VND' as const };
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export class GiftCodesService {
  constructor(private readonly db: Db = pool) {}

  private toDto(row: any): GiftCodeDto {
    const maxUses = row.max_uses == null ? null : Number(row.max_uses);
    const usedCount = Number(row.used_count ?? 0);
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description ?? '',
      rewardCash: money(Number(row.reward_cash_minor ?? 0)),
      maxUses,
      usesPerAccount: Number(row.uses_per_account ?? 1),
      usedCount,
      remainingUses: maxUses == null ? null : Math.max(0, maxUses - usedCount),
      isActive: !!row.is_active,
      startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
      endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async listAll(): Promise<GiftCodeDto[]> {
    const r = await (this.db as any).query(`SELECT * FROM gift_codes ORDER BY created_at DESC`);
    return r.rows.map((row: any) => this.toDto(row));
  }

  async getRedemptions(giftCodeId: string): Promise<GiftCodeRedemptionDto[]> {
    const r = await (this.db as any).query(
      `SELECT r.id, r.gift_code_id, r.user_id, r.character_id, r.amount_minor, r.redeemed_at,
              g.code, g.title,
              c.full_name AS character_name,
              u.email AS account_email, u.username AS account_username
       FROM gift_code_redemptions r
       JOIN gift_codes g ON g.id = r.gift_code_id
       LEFT JOIN characters c ON c.id = r.character_id
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.gift_code_id = $1
       ORDER BY r.redeemed_at DESC`,
      [giftCodeId],
    );
    return r.rows.map((row: any) => ({
      id: row.id,
      giftCodeId: row.gift_code_id,
      code: row.code,
      title: row.title,
      userId: row.user_id,
      characterId: row.character_id,
      characterName: row.character_name ?? null,
      accountEmail: row.account_email ?? null,
      accountUsername: row.account_username ?? null,
      amount: money(Number(row.amount_minor ?? 0)),
      redeemedAt: new Date(row.redeemed_at).toISOString(),
    }));
  }

  async create(input: UpsertGiftCodeRequest, actorId?: string | null): Promise<GiftCodeDto> {
    const code = normalizeCode(input.code);
    const r = await (this.db as any).query(
      `INSERT INTO gift_codes (id, code, title, description, reward_cash_minor, max_uses, uses_per_account, is_active, starts_at, ends_at, created_by_actor_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        code,
        input.title,
        input.description ?? '',
        input.rewardCashMinor ?? 0,
        input.maxUses ?? null,
        input.usesPerAccount ?? 1,
        input.isActive ?? true,
        input.startsAt ?? null,
        input.endsAt ?? null,
        actorId ?? null,
      ],
    );
    const dto = this.toDto(r.rows[0]);
    await writeActionLog(pool as any, actorId ?? null, 'gift_code.create', { giftCodeId: dto.id, code: dto.code, title: dto.title });
    return dto;
  }

  async update(id: string, input: UpsertGiftCodeRequest, actorId?: string | null): Promise<GiftCodeDto> {
    const code = normalizeCode(input.code);
    const r = await (this.db as any).query(
      `UPDATE gift_codes
       SET code = $2, title = $3, description = $4, reward_cash_minor = $5, max_uses = $6,
           uses_per_account = $7, is_active = $8, starts_at = $9, ends_at = $10, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        code,
        input.title,
        input.description ?? '',
        input.rewardCashMinor ?? 0,
        input.maxUses ?? null,
        input.usesPerAccount ?? 1,
        input.isActive ?? true,
        input.startsAt ?? null,
        input.endsAt ?? null,
      ],
    );
    if (!r.rows[0]) throw AppError.notFound('Gift code');
    const dto = this.toDto(r.rows[0]);
    await writeActionLog(pool as any, actorId ?? null, 'gift_code.update', { giftCodeId: dto.id, code: dto.code });
    return dto;
  }

  async remove(id: string, actorId?: string | null): Promise<void> {
    const r = await (this.db as any).query(`DELETE FROM gift_codes WHERE id = $1 RETURNING id, code`, [id]);
    if (r.rows[0]) {
      await writeActionLog(pool as any, actorId ?? null, 'gift_code.delete', { giftCodeId: r.rows[0].id, code: r.rows[0].code });
    }
  }

  async listMine(userId: string): Promise<MyGiftCodeRedemptionDto[]> {
    const r = await (this.db as any).query(
      `SELECT r.id, r.amount_minor, r.redeemed_at, g.code, g.title
       FROM gift_code_redemptions r
       JOIN gift_codes g ON g.id = r.gift_code_id
       WHERE r.user_id = $1
       ORDER BY r.redeemed_at DESC`,
      [userId],
    );
    return r.rows.map((row: any) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      amount: money(Number(row.amount_minor ?? 0)),
      redeemedAt: new Date(row.redeemed_at).toISOString(),
    }));
  }

  async redeem(userId: string, input: RedeemGiftCodeRequest): Promise<RedeemGiftCodeResponse> {
    const code = normalizeCode(input.code);
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);

      const gr = await (client as any).query(`SELECT * FROM gift_codes WHERE code = $1 FOR UPDATE`, [code]);
      const g = gr.rows[0];
      if (!g) {
        throw AppError.badRequest('Mã quà tặng không tồn tại hoặc không hợp lệ.');
      }

      const now = new Date();
      if (!g.is_active) throw AppError.badRequest('Mã quà tặng hiện không khả dụng.');
      if (g.starts_at && new Date(g.starts_at) > now) throw AppError.badRequest('Mã quà tặng chưa đến thời gian sử dụng.');
      if (g.ends_at && new Date(g.ends_at) < now) throw AppError.badRequest('Mã quà tặng đã hết hạn.');
      if (g.max_uses != null && Number(g.used_count) >= Number(g.max_uses)) {
        throw AppError.badRequest('Mã quà tặng đã hết lượt sử dụng.');
      }

      const existing = await (client as any).query(
        `SELECT id FROM gift_code_redemptions WHERE gift_code_id = $1 AND user_id = $2 FOR UPDATE`,
        [g.id, userId],
      );
      if (existing.rows[0]) {
        const bal = await ledger.getBalance(client, 'character', character.id);
        return {
          ok: true,
          redeemed: false,
          amount: money(Number(g.reward_cash_minor ?? 0)),
          balanceAfter: money(bal),
          giftCode: { id: g.id, code: g.code, title: g.title },
          message: 'Bạn đã sử dụng mã quà tặng này rồi.',
        };
      }

      const amountMinor = Number(g.reward_cash_minor ?? 0);
      if (amountMinor > 0) {
        await ledger.post(client as any, {
          kind: 'gift_code_reward',
          description: `Nhận thưởng mã quà tặng ${g.code}`,
          referenceType: 'gift_code',
          referenceId: g.id,
          legs: [
            { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: -amountMinor },
            { ownerType: 'character', ownerId: character.id, kind: 'cash', deltaMinor: amountMinor },
          ],
        });
      }

      await (client as any).query(
        `INSERT INTO gift_code_redemptions (id, gift_code_id, user_id, character_id, amount_minor)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [g.id, userId, character.id, amountMinor],
      );
      await (client as any).query(
        `UPDATE gift_codes SET used_count = used_count + 1, updated_at = now() WHERE id = $1`,
        [g.id],
      );

      const bal = await ledger.getBalance(client, 'character', character.id);
      return {
        ok: true,
        redeemed: true,
        amount: money(amountMinor),
        balanceAfter: money(bal),
        giftCode: { id: g.id, code: g.code, title: g.title },
        message: amountMinor > 0 ? `Đã nhập mã thành công! Bạn nhận được ${amountMinor.toLocaleString('vi-VN')} ₫.` : 'Đã nhập mã thành công.',
      };
    });
  }
}

export const giftCodesService = new GiftCodesService();
