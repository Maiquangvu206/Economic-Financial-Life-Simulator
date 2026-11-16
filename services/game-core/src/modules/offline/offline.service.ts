import { pool } from '../../shared/db/pool.js';
import { type Db } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { writeActionLog } from '../../shared/audit/actionLog.js';
import { welfareService } from '../welfare/welfare.service.js';
import { taxService } from '../tax/tax.service.js';
import { BankingService } from '../banking/banking.service.js';
import { BankingRepository } from '../banking/banking.repository.js';
import { CharactersRepository } from '../characters/characters.repository.js';
import type {
  OfflinePlayerSettingsDto,
  UpdateOfflinePlayerSettingsRequest,
  OfflinePolicyDto,
  UpdateOfflinePolicyRequest,
  OfflineProcessResponse,
  OfflineRecapDto,
} from '@efls/contracts';

const bankingService = new BankingService(new BankingRepository(), new CharactersRepository());

function money(amount: number) {
  return { amount, currency: 'VND' as const };
}

export class OfflineService {
  constructor(private readonly db: Db = pool) {}

  async getPolicy(): Promise<OfflinePolicyDto> {
    const r = await (this.db as any).query(`SELECT * FROM offline_policies WHERE id = 1`);
    const row = r.rows[0];
    if (!row) {
      return {
        enabled: true,
        maxOfflineMinutes: 1440,
        allowAutoClaimWelfare: true,
        allowAutoPay: true,
        allowCatchup: true,
        defaultAutoClaimWelfare: true,
        defaultAutoPay: true,
        defaultCatchup: true,
        defaultShowRecap: true,
      };
    }
    return {
      enabled: !!row.enabled,
      maxOfflineMinutes: Number(row.max_offline_minutes ?? 1440),
      allowAutoClaimWelfare: !!row.allow_auto_claim_welfare,
      allowAutoPay: !!row.allow_auto_pay,
      allowCatchup: !!row.allow_catchup,
      defaultAutoClaimWelfare: !!row.default_auto_claim_welfare,
      defaultAutoPay: !!row.default_auto_pay,
      defaultCatchup: !!row.default_catchup,
      defaultShowRecap: !!row.default_show_recap,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
  }

  async updatePolicy(input: UpdateOfflinePolicyRequest, actorId?: string | null): Promise<OfflinePolicyDto> {
    const current = await this.getPolicy();
    const next = {
      enabled: input.enabled ?? current.enabled,
      maxOfflineMinutes: Math.max(0, Math.min(10080, input.maxOfflineMinutes ?? current.maxOfflineMinutes)),
      allowAutoClaimWelfare: input.allowAutoClaimWelfare ?? current.allowAutoClaimWelfare,
      allowAutoPay: input.allowAutoPay ?? current.allowAutoPay,
      allowCatchup: input.allowCatchup ?? current.allowCatchup,
      defaultAutoClaimWelfare: input.defaultAutoClaimWelfare ?? current.defaultAutoClaimWelfare,
      defaultAutoPay: input.defaultAutoPay ?? current.defaultAutoPay,
      defaultCatchup: input.defaultCatchup ?? current.defaultCatchup,
      defaultShowRecap: input.defaultShowRecap ?? current.defaultShowRecap,
    };
    await (this.db as any).query(
      `INSERT INTO offline_policies (
         id, enabled, max_offline_minutes, allow_auto_claim_welfare, allow_auto_pay, allow_catchup,
         default_auto_claim_welfare, default_auto_pay, default_catchup, default_show_recap, updated_at
       )
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       ON CONFLICT (id) DO UPDATE SET
         enabled=EXCLUDED.enabled,
         max_offline_minutes=EXCLUDED.max_offline_minutes,
         allow_auto_claim_welfare=EXCLUDED.allow_auto_claim_welfare,
         allow_auto_pay=EXCLUDED.allow_auto_pay,
         allow_catchup=EXCLUDED.allow_catchup,
         default_auto_claim_welfare=EXCLUDED.default_auto_claim_welfare,
         default_auto_pay=EXCLUDED.default_auto_pay,
         default_catchup=EXCLUDED.default_catchup,
         default_show_recap=EXCLUDED.default_show_recap,
         updated_at=now()`,
      [
        next.enabled,
        next.maxOfflineMinutes,
        next.allowAutoClaimWelfare,
        next.allowAutoPay,
        next.allowCatchup,
        next.defaultAutoClaimWelfare,
        next.defaultAutoPay,
        next.defaultCatchup,
        next.defaultShowRecap,
      ],
    );
    try {
      await writeActionLog(pool as any, actorId ?? null, 'admin.offline_policy.update', next as any);
    } catch {
      /* ignore audit failure */
    }
    return this.getPolicy();
  }

  private toSettings(row: any, policy: OfflinePolicyDto): OfflinePlayerSettingsDto {
    if (!row) {
      return {
        offlineProcessingEnabled: policy.enabled,
        autoClaimWelfare: policy.defaultAutoClaimWelfare && policy.allowAutoClaimWelfare,
        autoPay: policy.defaultAutoPay && policy.allowAutoPay,
        catchupEnabled: policy.defaultCatchup && policy.allowCatchup,
        showRecapOnLogin: policy.defaultShowRecap,
        lastOfflineProcessedAt: null,
      };
    }
    return {
      characterId: row.character_id,
      offlineProcessingEnabled: !!row.offline_processing_enabled,
      autoClaimWelfare: !!row.auto_claim_welfare && policy.allowAutoClaimWelfare,
      autoPay: !!row.auto_pay && policy.allowAutoPay,
      catchupEnabled: !!row.catchup_enabled && policy.allowCatchup,
      showRecapOnLogin: !!row.show_recap_on_login,
      lastOfflineProcessedAt: row.last_offline_processed_at ? new Date(row.last_offline_processed_at).toISOString() : null,
    };
  }

  private async ensureSettingsRow(characterId: string, policy: OfflinePolicyDto): Promise<void> {
    await (this.db as any).query(
      `INSERT INTO character_offline_settings (
         character_id, offline_processing_enabled, auto_claim_welfare, auto_pay, catchup_enabled, show_recap_on_login, last_offline_processed_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,now(),now())
       ON CONFLICT (character_id) DO NOTHING`,
      [
        characterId,
        policy.enabled,
        policy.defaultAutoClaimWelfare && policy.allowAutoClaimWelfare,
        policy.defaultAutoPay && policy.allowAutoPay,
        policy.defaultCatchup && policy.allowCatchup,
        policy.defaultShowRecap,
      ],
    );
  }

  async getSettings(userId: string): Promise<OfflinePlayerSettingsDto> {
    const character = await requireCharacterByUserId(this.db, userId);
    const policy = await this.getPolicy();
    const r = await (this.db as any).query(`SELECT * FROM character_offline_settings WHERE character_id = $1`, [character.id]);
    if (!r.rows[0]) {
      await this.ensureSettingsRow(character.id, policy);
      const r2 = await (this.db as any).query(`SELECT * FROM character_offline_settings WHERE character_id = $1`, [character.id]);
      return this.toSettings(r2.rows[0], policy);
    }
    return this.toSettings(r.rows[0], policy);
  }

  async updateSettings(userId: string, input: UpdateOfflinePlayerSettingsRequest): Promise<OfflinePlayerSettingsDto> {
    const character = await requireCharacterByUserId(this.db, userId);
    const policy = await this.getPolicy();
    const current = await this.getSettings(userId);
    const next = {
      offlineProcessingEnabled: input.offlineProcessingEnabled ?? current.offlineProcessingEnabled,
      autoClaimWelfare: (input.autoClaimWelfare ?? current.autoClaimWelfare) && policy.allowAutoClaimWelfare,
      autoPay: (input.autoPay ?? current.autoPay) && policy.allowAutoPay,
      catchupEnabled: (input.catchupEnabled ?? current.catchupEnabled) && policy.allowCatchup,
      showRecapOnLogin: input.showRecapOnLogin ?? current.showRecapOnLogin,
    };
    await (this.db as any).query(
      `INSERT INTO character_offline_settings (
         character_id, offline_processing_enabled, auto_claim_welfare, auto_pay, catchup_enabled, show_recap_on_login, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT (character_id) DO UPDATE SET
         offline_processing_enabled=EXCLUDED.offline_processing_enabled,
         auto_claim_welfare=EXCLUDED.auto_claim_welfare,
         auto_pay=EXCLUDED.auto_pay,
         catchup_enabled=EXCLUDED.catchup_enabled,
         show_recap_on_login=EXCLUDED.show_recap_on_login,
         updated_at=now()`,
      [character.id, next.offlineProcessingEnabled, next.autoClaimWelfare, next.autoPay, next.catchupEnabled, next.showRecapOnLogin],
    );
    return this.getSettings(userId);
  }

  async getLatestRecap(userId: string): Promise<OfflineRecapDto | null> {
    const character = await requireCharacterByUserId(this.db, userId);
    const r = await (this.db as any).query(
      `SELECT * FROM offline_recaps WHERE character_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [character.id],
    );
    const row = r.rows[0];
    if (!row) return null;
    const summary = row.summary && typeof row.summary === 'object' ? row.summary : {};
    return {
      id: row.id,
      characterId: row.character_id,
      from: new Date(row.from_at).toISOString(),
      to: new Date(row.to_at).toISOString(),
      processedMinutes: Number(row.processed_minutes ?? 0),
      income: money(Number(row.income_minor ?? 0)),
      expenses: money(Number(row.expenses_minor ?? 0)),
      netCashFlow: money(Number(row.net_cash_flow_minor ?? 0)),
      stockMovements: Array.isArray((summary as any).stockMovements) ? (summary as any).stockMovements : [],
      events: Array.isArray(row.events) ? row.events : [],
      summary,
    };
  }

  private async touchProcessedAt(characterId: string): Promise<void> {
    await (this.db as any).query(
      `UPDATE character_offline_settings SET last_offline_processed_at = now(), updated_at = now() WHERE character_id = $1`,
      [characterId],
    );
  }

  async processForUser(userId: string): Promise<OfflineProcessResponse> {
    const policy = await this.getPolicy();
    const character = await requireCharacterByUserId(this.db, userId);
    const settings = await this.getSettings(userId);

    const now = new Date();
    if (!settings.lastOfflineProcessedAt) {
      await this.touchProcessedAt(character.id);
      return { ok: true, processed: false, recap: null, message: 'Đã khởi tạo mốc offline.' };
    }

    const last = new Date(settings.lastOfflineProcessedAt);
    const elapsedMin = Math.floor((now.getTime() - last.getTime()) / 60000);
    if (elapsedMin < 1) {
      return { ok: true, processed: false, recap: await this.getLatestRecap(userId), message: 'Chưa có khoảng thời gian offline mới.' };
    }

    const cappedMin = Math.max(0, Math.min(elapsedMin, policy.maxOfflineMinutes));
    const canCatchup = policy.enabled && settings.offlineProcessingEnabled && settings.catchupEnabled && policy.allowCatchup;
    const effectiveMin = canCatchup ? cappedMin : 0;

    const events: Array<{ type: string; message: string }> = [];
    let incomeMinor = 0;
    let expensesMinor = 0;
    let welfareClaimedCount = 0;
    let welfareClaimedMinor = 0;
    let taxesPaid = 0;
    let taxesPaidMinor = 0;
    let loansPaid = 0;
    let loansPaidMinor = 0;

    // Auto-claim welfare (idempotent)
    if (policy.enabled && settings.offlineProcessingEnabled && settings.autoClaimWelfare && policy.allowAutoClaimWelfare) {
      try {
        const available = await welfareService.getAvailableForUser(userId);
        const claimable = available.filter((b: any) => b.claimable);
        for (const b of claimable.slice(0, 50)) {
          try {
            const res = await welfareService.claim(userId, { benefitId: b.id, periodYear: b.periodYear } as any);
            if (res?.claimed) {
              welfareClaimedCount += 1;
              const amt = Number(res.amount?.amount ?? b.bonus?.amount ?? 0);
              welfareClaimedMinor += amt;
              incomeMinor += amt;
              events.push({ type: 'welfare', message: `Tự nhận phúc lợi: ${b.name} (+${amt.toLocaleString('vi-VN')} ₫)` });
            }
          } catch {
            /* skip individual claim */
          }
        }
      } catch {
        events.push({ type: 'welfare', message: 'Không thể tự nhận phúc lợi trong lần xử lý này.' });
      }
    }

    // Auto-pay due taxes and overdue loans (best-effort)
    if (policy.enabled && settings.offlineProcessingEnabled && settings.autoPay && policy.allowAutoPay) {
      // Taxes due
      try {
        const living = await requireLivingCharacterByUserId(this.db, userId);
        const dueTaxes = await (this.db as any).query(
          `SELECT id, tax_year, tax_due_minor
           FROM tax_assessments
           WHERE character_id = $1 AND status = 'due'
           ORDER BY due_at ASC NULLS LAST, tax_year ASC
           LIMIT 20`,
          [living.id],
        );
        for (const t of dueTaxes.rows) {
          const due = Number(t.tax_due_minor ?? 0);
          if (due <= 0) continue;
          try {
            await taxService.pay(userId, t.id);
            taxesPaid += 1;
            taxesPaidMinor += due;
            expensesMinor += due;
            events.push({ type: 'tax', message: `Tự nộp thuế năm ${t.tax_year} (-${due.toLocaleString('vi-VN')} ₫)` });
          } catch {
            /* insufficient funds or other constraint */
          }
        }
      } catch {
        /* ignore tax auto-pay block */
      }

      // Loans overdue/active
      try {
        const living = await requireLivingCharacterByUserId(this.db, userId);
        const loans = await (this.db as any).query(
          `SELECT id, outstanding_minor, monthly_payment_minor
           FROM loans
           WHERE borrower_id = $1 AND status IN ('active','grace') AND next_due_at <= now()
           ORDER BY next_due_at ASC
           LIMIT 20`,
          [living.id],
        );
        for (const l of loans.rows) {
          const outstanding = Number(l.outstanding_minor ?? 0);
          const monthly = Number(l.monthly_payment_minor ?? 0);
          const payAmt = Math.max(0, Math.min(outstanding, monthly > 0 ? monthly : outstanding));
          if (payAmt <= 0) continue;
          try {
            await (bankingService as any).repayLoan(userId, l.id, payAmt);
            loansPaid += 1;
            loansPaidMinor += payAmt;
            expensesMinor += payAmt;
            events.push({ type: 'loan', message: `Tự trả khoản vay ${String(l.id).slice(0, 8)} (-${payAmt.toLocaleString('vi-VN')} ₫)` });
          } catch {
            /* insufficient funds or other constraint */
          }
        }
      } catch {
        /* ignore loan auto-pay block */
      }
    }

    if (elapsedMin > 0) {
      if (!policy.enabled) {
        events.push({ type: 'info', message: 'Xử lý offline đang tắt theo chính sách hệ thống.' });
      } else if (!settings.offlineProcessingEnabled) {
        events.push({ type: 'info', message: 'Bạn đã tắt xử lý offline trong cài đặt cá nhân.' });
      } else if (!canCatchup) {
        events.push({ type: 'info', message: 'Bù tiến trình offline đang tắt hoặc bị giới hạn bởi chính sách.' });
      } else {
        events.push({
          type: 'info',
          message: `Đã ghi nhận ${effectiveMin}/${elapsedMin} phút offline (giới hạn chính sách: ${policy.maxOfflineMinutes} phút).`,
        });
      }
    }

    if (events.length === 0) {
      events.push({ type: 'info', message: 'Không có thay đổi tự động nào trong thời gian offline.' });
    }

    const net = incomeMinor - expensesMinor;
    const meaningfulChange =
      incomeMinor !== 0 ||
      expensesMinor !== 0 ||
      welfareClaimedCount > 0 ||
      taxesPaid > 0 ||
      loansPaid > 0 ||
      (canCatchup && effectiveMin > 0);

    const summary = {
      elapsedMinutes: elapsedMin,
      cappedMinutes: cappedMin,
      processedMinutes: effectiveMin,
      policyEnabled: policy.enabled,
      welfareClaimedCount,
      welfareClaimedMinor,
      taxesPaid,
      taxesPaidMinor,
      loansPaid,
      loansPaidMinor,
      autoClaimWelfare: settings.autoClaimWelfare && policy.allowAutoClaimWelfare,
      autoPay: settings.autoPay && policy.allowAutoPay,
      catchupEnabled: canCatchup,
      stockMovements: [],
    };

    // Nếu không có thay đổi/tác vụ thực tế, chỉ cập nhật mốc thời gian để tránh tạo recap rác lặp lại.
    if (!meaningfulChange) {
      await this.touchProcessedAt(character.id);
      return {
        ok: true,
        processed: false,
        recap: await this.getLatestRecap(userId),
        message:
          elapsedMin > 0
            ? `Không có thay đổi tự động trong ${elapsedMin} phút offline.`
            : 'Không có thay đổi offline mới.',
      };
    }

    const recap: OfflineRecapDto = {
      characterId: character.id,
      from: last.toISOString(),
      to: now.toISOString(),
      processedMinutes: effectiveMin,
      income: money(incomeMinor),
      expenses: money(expensesMinor),
      netCashFlow: money(net),
      stockMovements: [],
      events,
      summary,
    };

    await (this.db as any).query(
      `INSERT INTO offline_recaps (id, character_id, from_at, to_at, processed_minutes, income_minor, expenses_minor, net_cash_flow_minor, summary, events)
       VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [
        character.id,
        last.toISOString(),
        now.toISOString(),
        effectiveMin,
        incomeMinor,
        expensesMinor,
        net,
        JSON.stringify(summary),
        JSON.stringify(events),
      ],
    );
    await this.touchProcessedAt(character.id);

    return {
      ok: true,
      processed: true,
      recap,
      message:
        incomeMinor !== 0 || expensesMinor !== 0
          ? `Đã xử lý offline (${effectiveMin}/${elapsedMin} phút). Dòng tiền ròng: ${net.toLocaleString('vi-VN')} ₫.`
          : `Đã xử lý offline (${effectiveMin}/${elapsedMin} phút).`,
    };
  }
}

export const offlineService = new OfflineService();
