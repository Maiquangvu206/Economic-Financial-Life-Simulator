import { applyGmAdjustment } from '@efls/domain';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';
import { callAiService } from '../../shared/ai/aiClient.js';
import { notify } from '../notifications/notification.service.js';
import { type GmSnapshotDto, type GmDirectiveDto, MoneySchema } from '@efls/contracts';
import { gmRepository } from './gm.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

interface GmProposalRaw {
  action?: string;
  magnitude?: number;
  rationale?: string;
}

/** Dịch vụ GM AI: snapshot vĩ mô + điều chỉnh có biên (kể cả thủ công qua admin/player). */
export class GmService {
  constructor(private readonly repository = gmRepository) {}

  async getSnapshot(userId: string): Promise<GmSnapshotDto> {
    const db = this.repository.db;
    await requireCharacterByUserId(db, userId);
    const [macro, marketCap, moneySupply] = await Promise.all([
      this.repository.getMacro(db),
      this.repository.marketCap(db),
      this.repository.moneySupply(db),
    ]);
    return {
      inflationPct: macro.inflationPct ?? 0,
      unemploymentPct: macro.unemploymentPct ?? 0,
      moneySupply: money(moneySupply),
      marketCap: money(marketCap),
      baseRatePct: macro.baseRatePct ?? 0,
    };
  }

  /** Điều chỉnh vĩ mô thủ công: gọi AI đề xuất rồi core áp biên. */
  async adjust(userId: string): Promise<GmDirectiveDto> {
    return withTransaction(async (client) => {
      await requireCharacterByUserId(client, userId);
      const macro = await this.repository.getMacro(client);
      const [marketCap, moneySupply] = await Promise.all([
        this.repository.marketCap(client),
        this.repository.moneySupply(client),
      ]);
      const snapshot = {
        inflationPct: macro.inflationPct ?? 0,
        unemploymentPct: macro.unemploymentPct ?? 0,
        moneySupply,
        marketCap,
      };

      const { data } = await callAiService<GmProposalRaw>('/v1/gm/propose', {
        snapshot: {
          inflation_pct: snapshot.inflationPct,
          unemployment_pct: snapshot.unemploymentPct,
          money_supply: snapshot.moneySupply,
          market_cap: snapshot.marketCap,
        },
        allowed_actions: ['raise_rate', 'cut_rate', 'trigger_crisis', 'stimulus', 'do_nothing'],
      });
      const action = (data?.action ?? 'do_nothing') as
        'raise_rate' | 'cut_rate' | 'trigger_crisis' | 'stimulus' | 'do_nothing';
      const magnitude = Math.max(0, Math.min(1, data?.magnitude ?? 0));
      const rationale = data?.rationale ?? 'GM giữ nguyên trạng thái.';

      const { next } = applyGmAdjustment({
        action,
        magnitude,
        current: {
          inflationPct: macro.inflationPct ?? 0,
          unemploymentPct: macro.unemploymentPct ?? 0,
          baseRatePct: macro.baseRatePct ?? 5,
          gdpGrowthPct: macro.gdpGrowthPct ?? 0,
          cpi: macro.cpi ?? 100,
        },
      });

      if (action !== 'do_nothing') {
        await this.repository.setMacro(client, next);
      }
      const id = await this.repository.insertDirective(
        client,
        action,
        magnitude,
        rationale,
        { ...snapshot, moneySupply: snapshot.moneySupply, marketCap: snapshot.marketCap },
        action !== 'do_nothing',
      );
      await enqueueDomainEvent(client, {
        type: 'gm.directive.v1',
        aggregateType: 'gm',
        aggregateId: id,
        payload: { action, magnitude },
      });
      await notify(client, {
        userId,
        kind: 'gm',
        title: 'GM điều chỉnh vĩ mô',
        body: `${action} (mức độ ${magnitude.toFixed(2)}): ${rationale}`,
        payload: { directiveId: id, action, magnitude },
      });

      return {
        id,
        action,
        magnitude,
        rationale,
        snapshot: {
          inflationPct: snapshot.inflationPct,
          unemploymentPct: snapshot.unemploymentPct,
          moneySupply: money(snapshot.moneySupply),
          marketCap: money(snapshot.marketCap),
        },
        applied: action !== 'do_nothing',
        createdAt: new Date().toISOString(),
      };
    });
  }

  async listDirectives(userId: string): Promise<GmDirectiveDto[]> {
    const db = this.repository.db;
    await requireCharacterByUserId(db, userId);
    const rows = await this.repository.listDirectives(db);
    return rows.map((r) => ({
      id: r.id,
      action: r.action as GmDirectiveDto['action'],
      magnitude: Number(r.magnitude),
      rationale: r.rationale,
      snapshot: {
        inflationPct: Number(r.snapshot.inflationPct ?? 0),
        unemploymentPct: Number(r.snapshot.unemploymentPct ?? 0),
        moneySupply: money(Number(r.snapshot.moneySupply ?? 0)),
        marketCap: money(Number(r.snapshot.marketCap ?? 0)),
      },
      applied: r.applied,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

export const gmService = new GmService();
