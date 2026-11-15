import { AppError } from '../../shared/http/errors.js';
import { pool } from '../../shared/db/pool.js';
import { withTransaction, type Db } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger } from '../../shared/ledger/ledger.service.js';
import type { ClaimWelfareRequest, ClaimWelfareResponse, UpsertWelfareBenefitRequest, WelfareAvailableDto, WelfareBenefitDto } from '@efls/contracts';

function money(amount: number) {
  return { amount, currency: 'VND' as const };
}

export class WelfareService {
  constructor(private readonly db: Db = pool) {}

  private toDto(row: any): WelfareBenefitDto {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? '',
      sender: row.sender ?? 'Hệ thống',
      bonus: money(Number(row.bonus_minor)),
      month: row.month ?? null,
      day: row.day ?? null,
      isActive: !!row.is_active,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
  }

  private async getGameYear(db: Db = this.db): Promise<number> {
    const r = await (db as any).query(`SELECT current_year FROM game_state WHERE id = 1`);
    return Number(r.rows[0]?.current_year ?? new Date().getUTCFullYear());
  }

  async listAll(): Promise<WelfareBenefitDto[]> {
    const r = await (this.db as any).query(
      `SELECT * FROM welfare_benefits ORDER BY is_active DESC, month NULLS LAST, day NULLS LAST, name ASC`,
    );
    return r.rows.map((row: any) => this.toDto(row));
  }

  async listActive(): Promise<WelfareBenefitDto[]> {
    const r = await (this.db as any).query(
      `SELECT * FROM welfare_benefits WHERE is_active = true ORDER BY month NULLS LAST, day NULLS LAST, name ASC`,
    );
    return r.rows.map((row: any) => this.toDto(row));
  }

  async upsert(input: UpsertWelfareBenefitRequest, id?: string): Promise<WelfareBenefitDto> {
    const code = (input.code && input.code.trim()) || (id ? undefined : `benefit_${Date.now()}`);
    if (id) {
      const r = await (this.db as any).query(
        `UPDATE welfare_benefits
         SET code = COALESCE($2, code), name = $3, description = $4, sender = $5, bonus_minor = $6,
             month = $7, day = $8, is_active = $9, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id, input.code ?? null, input.name, input.description ?? '', input.sender ?? 'Hệ thống', input.bonusMinor ?? 0, input.month ?? null, input.day ?? null, input.isActive ?? true],
      );
      if (!r.rows[0]) throw AppError.notFound('Welfare benefit');
      return this.toDto(r.rows[0]);
    }
    const r = await (this.db as any).query(
      `INSERT INTO welfare_benefits (id, code, name, description, sender, bonus_minor, month, day, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [code, input.name, input.description ?? '', input.sender ?? 'Hệ thống', input.bonusMinor ?? 0, input.month ?? null, input.day ?? null, input.isActive ?? true],
    );
    return this.toDto(r.rows[0]);
  }

  async remove(id: string): Promise<void> {
    await (this.db as any).query(`DELETE FROM welfare_benefits WHERE id = $1`, [id]);
  }

  async getAvailableForUser(userId: string, gameYear?: number, gameMonth?: number, gameDay?: number): Promise<WelfareAvailableDto[]> {
    const character = await requireCharacterByUserId(this.db, userId);
    const periodYear = gameYear ?? await this.getGameYear(this.db);
    const r = await (this.db as any).query(
      `SELECT b.*, wc.id AS claim_id
       FROM welfare_benefits b
       LEFT JOIN welfare_claims wc ON wc.benefit_id = b.id AND wc.character_id = $1 AND wc.period_year = $2
       WHERE b.is_active = true
       ORDER BY b.month NULLS LAST, b.day NULLS LAST, b.name ASC`,
      [character.id, periodYear],
    );
    return r.rows.map((row: any) => {
      const claimed = !!row.claim_id;
      const matchesDate = row.month == null || row.day == null
        ? true
        : (gameMonth != null && gameDay != null ? (Number(row.month) === gameMonth && Number(row.day) === gameDay) : true);
      return {
        ...this.toDto(row),
        claimed,
        claimable: !claimed && matchesDate && Number(row.bonus_minor) >= 0,
        periodYear,
      } as WelfareAvailableDto;
    });
  }

  async claim(userId: string, input: ClaimWelfareRequest): Promise<ClaimWelfareResponse> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const periodYear = input.periodYear ?? input.gameYear ?? await this.getGameYear(client);

      let benefitRow: any = null;
      if (input.benefitId) {
        const r = await (client as any).query(`SELECT * FROM welfare_benefits WHERE id = $1`, [input.benefitId]);
        benefitRow = r.rows[0] ?? null;
      } else if (input.code) {
        const r = await (client as any).query(`SELECT * FROM welfare_benefits WHERE code = $1`, [input.code]);
        benefitRow = r.rows[0] ?? null;
      } else if (input.gameMonth != null && input.gameDay != null) {
        const r = await (client as any).query(
          `SELECT * FROM welfare_benefits WHERE is_active = true AND month = $1 AND day = $2 ORDER BY updated_at DESC LIMIT 1`,
          [input.gameMonth, input.gameDay],
        );
        benefitRow = r.rows[0] ?? null;
      }

      if (!benefitRow) throw AppError.notFound('Không tìm thấy phúc lợi để nhận.');
      if (!benefitRow.is_active) throw AppError.badRequest('Phúc lợi này hiện không khả dụng.');

      const existing = await (client as any).query(
        `SELECT id FROM welfare_claims WHERE benefit_id = $1 AND character_id = $2 AND period_year = $3 FOR UPDATE`,
        [benefitRow.id, character.id, periodYear],
      );
      if (existing.rows[0]) {
        const bal = await ledger.getBalance(client, 'character', character.id);
        return {
          ok: true,
          claimed: false,
          amount: money(Number(benefitRow.bonus_minor)),
          balanceAfter: money(bal),
          benefit: this.toDto(benefitRow),
          message: 'Bạn đã nhận phúc lợi này trong kỳ hiện tại.',
        };
      }

      const amountMinor = Number(benefitRow.bonus_minor || 0);
      if (amountMinor > 0) {
        // nguồn hệ thống: ghi nhận tăng số dư (cash) an toàn theo ledger nếu có tài khoản nguồn; dùng market/system
        await (client as any).query(
          `INSERT INTO ledger_accounts (owner_type, owner_id, kind, balance_minor)
           VALUES ('character', $1, 'cash', 0)
           ON CONFLICT (owner_type, owner_id, kind, currency) DO NOTHING`,
          [character.id],
        );
        await (client as any).query(
          `UPDATE ledger_accounts SET balance_minor = balance_minor + $2, updated_at = now()
           WHERE owner_type='character' AND owner_id=$1 AND kind='cash' AND currency='VND'`,
          [character.id, amountMinor],
        );
        await (client as any).query(
          `UPDATE characters SET cash_minor = cash_minor + $2, updated_at = now() WHERE id = $1`,
          [character.id, amountMinor],
        );
      }

      await (client as any).query(
        `INSERT INTO welfare_claims (id, benefit_id, character_id, period_year, amount_minor)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [benefitRow.id, character.id, periodYear, amountMinor],
      );

      const bal = await ledger.getBalance(client, 'character', character.id);
      return {
        ok: true,
        claimed: true,
        amount: money(amountMinor),
        balanceAfter: money(bal),
        benefit: this.toDto(benefitRow),
        message: amountMinor > 0 ? 'Đã nhận phúc lợi vào tài khoản.' : 'Đã ghi nhận phúc lợi.',
      };
    });
  }
}

export const welfareService = new WelfareService();
