import type { PoolClient } from 'pg';
import { applyHeat, shouldTriggerSweep } from '@efls/domain';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction, type Db } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import {
  ledger,
  SYSTEM_ESCROW_ID,
  SYSTEM_GOVERNMENT_ID,
  SYSTEM_MARKET_ID,
} from '../../shared/ledger/ledger.service.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';
import { notify } from '../notifications/notification.service.js';
import {
  type CrimeType,
  type CrimeResultDto,
  type UnderworldOverviewExtDto,
  MoneySchema,
} from '@efls/contracts';
import { underworldRepository } from './underworld.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

interface CrimeConfig {
  name: string;
  heat: number;
  risk: number; // 0-100, xác suất bị bắt
  minPayout: number;
  maxPayout: number;
  fine: number;
}

/** Cân bằng kinh tế ngầm: rủi ro càng cao, phần thưởng càng lớn. */
const CRIME_CATALOG: Record<CrimeType, CrimeConfig> = {
  forgery: {
    name: 'Giả mạo giấy tờ',
    heat: 4,
    risk: 10,
    minPayout: 1_000_000,
    maxPayout: 5_000_000,
    fine: 5_000_000,
  },
  blackmail: {
    name: 'Tống tiền',
    heat: 6,
    risk: 18,
    minPayout: 2_000_000,
    maxPayout: 10_000_000,
    fine: 8_000_000,
  },
  tax_evasion: {
    name: 'Trốn thuế',
    heat: 8,
    risk: 25,
    minPayout: 5_000_000,
    maxPayout: 20_000_000,
    fine: 15_000_000,
  },
  fraud: {
    name: 'Lừa đảo',
    heat: 10,
    risk: 30,
    minPayout: 8_000_000,
    maxPayout: 30_000_000,
    fine: 20_000_000,
  },
  sabotage: {
    name: 'Phá hoại',
    heat: 12,
    risk: 35,
    minPayout: 10_000_000,
    maxPayout: 40_000_000,
    fine: 25_000_000,
  },
  money_laundering: {
    name: 'Rửa tiền',
    heat: 14,
    risk: 40,
    minPayout: 15_000_000,
    maxPayout: 60_000_000,
    fine: 40_000_000,
  },
  heist: {
    name: 'Cướp tài sản',
    heat: 18,
    risk: 50,
    minPayout: 20_000_000,
    maxPayout: 100_000_000,
    fine: 60_000_000,
  },
  assault: {
    name: 'Hành hung',
    heat: 5,
    risk: 15,
    minPayout: 500_000,
    maxPayout: 3_000_000,
    fine: 4_000_000,
  },
};

const CREDENTIAL_PRICES: Record<string, number> = {
  fake_id: 2_000_000,
  business_license: 8_000_000,
  shell_company: 15_000_000,
};

/** Dịch vụ chợ đen & thám tử: crime, bằng chứng, blackmail, sting, bảo vệ, Đại án. */
export class UnderworldService {
  constructor(private readonly repository = underworldRepository) {}

  async getOverview(userId: string): Promise<UnderworldOverviewExtDto> {
    return this.getOverviewWithDb(userId, this.repository.db);
  }

  private async getOverviewWithDb(userId: string, db: Db): Promise<UnderworldOverviewExtDto> {
    const character = await requireCharacterByUserId(db, userId);
    const [heatEvents, credentials, evidences, blackmails, stings, protections, sweeps] =
      await Promise.all([
        this.repository.listHeatEvents(character.id, db),
        this.repository.listCredentials(character.id, db),
        this.repository.listEvidences(character.id, db),
        this.repository.listBlackmails(character.id, db),
        this.repository.listStings(character.id, db),
        this.repository.listProtections(character.id, db),
        this.repository.listSweeps(character.id, db),
      ]);
    const earned = await this.repository.undergroundEarned(character.id);

    return {
      heatLevel: character.heat_level,
      services: Object.entries(CRIME_CATALOG).map(([code, cfg]) => ({
        code,
        name: cfg.name,
        description: `${cfg.name}: phần thưởng ${cfg.minPayout}–${cfg.maxPayout} ₫, rủi ro bắt ${cfg.risk}%, heat +${cfg.heat}.`,
        heat: cfg.heat,
        minPayout: money(cfg.minPayout),
        maxPayout: money(cfg.maxPayout),
        risk: cfg.risk,
      })),
      heatEvents: heatEvents.map((h) => ({
        id: h.id,
        delta: h.delta,
        reason: h.reason,
        createdAt: h.createdAt.toISOString(),
      })),
      credentials: credentials.map((c) => ({
        id: c.id,
        kind: c.kind,
        quality: c.quality,
        active: c.active,
        createdAt: c.createdAt.toISOString(),
      })),
      evidences: evidences.map((e) => ({
        id: e.id,
        targetCharacterId: e.targetCharacterId,
        targetName: e.targetName,
        strength: e.strength,
        description: e.description,
        status: e.status as 'held' | 'sold' | 'used' | 'submitted',
        createdAt: e.createdAt.toISOString(),
      })),
      blackmails: blackmails.map((b) => ({
        id: b.id,
        blackmailerId: b.blackmailerId,
        targetId: b.targetId,
        targetName: b.targetName,
        monthlyPayment: money(Number(b.monthlyPaymentMinor)),
        status: b.status as 'active' | 'ended' | 'exposed',
        expiresAt: b.expiresAt?.toISOString() ?? null,
      })),
      stings: stings.map((s) => ({
        id: s.id,
        targetCharacterId: s.targetCharacterId,
        targetName: s.targetName,
        amount: money(Number(s.amountMinor)),
        result: s.result as 'pending' | 'caught' | 'failed',
        createdAt: s.createdAt.toISOString(),
      })),
      protections: protections.map((p) => ({
        id: p.id,
        kind: p.kind as 'bodyguard' | 'insurance',
        coverage: money(Number(p.coverageAmountMinor)),
        premium: money(Number(p.premiumMinor)),
        status: p.status as 'active' | 'expired',
        expiresAt: p.expiresAt.toISOString(),
      })),
      sweeps: sweeps.map((s) => ({
        id: s.id,
        triggerHeat: s.triggerHeat,
        fine: money(Number(s.fineMinor)),
        prisonDays: s.prisonDays,
        createdAt: s.createdAt.toISOString(),
      })),
      undergroundEarned: money(earned),
    };
  }

  /** Gây tội: tung xúc xắc rủi ro, nhận tiền ngầm nếu thoát, bị bắt + phạt nếu dính. */
  async commitCrime(userId: string, crimeType: CrimeType): Promise<CrimeResultDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const cfg = CRIME_CATALOG[crimeType];

      // Cân bằng ngầm: bị bắt nếu roll < risk + heat/4
      const catchChance = Math.min(90, cfg.risk + Math.round(character.heat_level / 4));
      const caught = Math.random() * 100 < catchChance;
      const payout = caught
        ? 0
        : Math.round(cfg.minPayout + Math.random() * (cfg.maxPayout - cfg.minPayout));

      const heatDelta = cfg.heat + (caught ? 8 : 0);
      const newHeat = applyHeat(character.heat_level, heatDelta);
      await this.repository.setHeat(client, character.id, newHeat);
      await this.repository.insertHeatEvent(
        client,
        character.id,
        heatDelta,
        `${cfg.name}${caught ? ' (bị bắt)' : ''}`,
      );

      let fine = 0;
      if (caught) {
        fine = cfg.fine;
        const balance = await ledger.getBalance(client, 'character', character.id);
        const payable = Math.min(fine, balance);
        if (payable > 0) {
          await ledger.transfer(client, {
            from: { ownerType: 'character', ownerId: character.id },
            to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID },
            amountMinor: payable,
            kind: 'crime_fine',
            description: `Phạt hình sự: ${cfg.name}`,
            referenceType: 'crime',
          });
        }
        await client.query(
          `INSERT INTO criminal_records
             (id, character_id, crime_type, fine_minor, prison_days)
           VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
          [character.id, crimeType, fine, 10],
        );
        await client.query(
          `INSERT INTO court_cases
             (id, defendant_id, plaintiff_type, crime_type, status)
           VALUES (gen_random_uuid(), $1, 'government', $2, 'open')`,
          [character.id, crimeType],
        );
      } else if (payout > 0) {
        await ledger.transfer(client, {
          from: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
          to: { ownerType: 'character', ownerId: character.id },
          amountMinor: payout,
          kind: 'crime_payout',
          description: `Thu nhập ngầm: ${cfg.name}`,
          referenceType: 'crime',
        });
      }

      await enqueueDomainEvent(client, {
        type: 'heat.increased.v1',
        aggregateType: 'character',
        aggregateId: character.id,
        payload: { characterId: character.id, crimeType, heatDelta, newHeat, caught },
      });

      await notify(client, {
        userId,
        kind: 'underworld',
        title: caught ? 'Bị bắt quả tang!' : 'Trót lọt!',
        body: caught
          ? `${cfg.name}: bị bắt, phạt ${fine} ₫, heat +${heatDelta}.`
          : `${cfg.name}: nhận ${payout.toLocaleString('vi-VN')} ₫, heat +${heatDelta}.`,
        payload: { crimeType, payout, caught, heatDelta, fine },
      });

      // Đại án tự động khi heat chạm manhunt
      if (shouldTriggerSweep(newHeat)) {
        await this.runSweep(client, character.id, character.user_id, newHeat);
      }

      return {
        crimeType,
        payout: money(payout),
        caught,
        heatDelta,
        fine: money(fine),
      };
    });
  }

  /** Mua giấy tờ giả. */
  async buyCredential(userId: string, kind: string): Promise<UnderworldOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const price = CREDENTIAL_PRICES[kind];
      if (price == null) throw AppError.badRequest('Loại giấy tờ không hợp lệ.');
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < price) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền mua giấy tờ giả.');
      }
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
        amountMinor: price,
        kind: 'credential_purchase',
        description: `Mua giấy tờ giả: ${kind}`,
        referenceType: 'credential',
      });
      const quality = 40 + Math.round(Math.random() * 50);
      await this.repository.insertCredential(client, character.id, kind, quality);
      await notify(client, {
        userId,
        kind: 'underworld',
        title: 'Mua giấy tờ giả',
        body: `Đã mua ${kind} (chất lượng ${quality}/100).`,
        payload: { kind, quality, price },
      });
      return this.getOverviewWithDb(userId, client);
    });
  }

  /** Thuê thám tử thu thập bằng chứng về một nhân vật. */
  async collectEvidence(
    userId: string,
    targetCharacterId: string,
    priceMinor: number,
  ): Promise<UnderworldOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      if (targetCharacterId === character.id) {
        throw AppError.badRequest('Không thể điều tra chính mình.');
      }
      const target = await client.query<{ id: string }>(`SELECT id FROM characters WHERE id = $1`, [
        targetCharacterId,
      ]);
      if (!target.rows[0]) throw AppError.notFound('Target character');
      if (priceMinor < 500_000) {
        throw AppError.badRequest('Chi phí thám tử tối thiểu 500.000 ₫.');
      }
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < priceMinor) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền thuê thám tử.');
      }
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
        amountMinor: priceMinor,
        kind: 'detective_fee',
        description: 'Thuê thám tử thu thập bằng chứng',
        referenceType: 'detective',
        referenceId: targetCharacterId,
      });
      await this.repository.insertMercenaryOrder(
        client,
        character.id,
        targetCharacterId,
        'investigation',
        priceMinor,
      );
      // Bằng chứng mạnh hơn khi chi nhiều tiền (tối đa 100)
      const strength = Math.min(100, 30 + Math.round(priceMinor / 200_000));
      const evidenceId = await this.repository.createEvidence(
        client,
        character.id,
        targetCharacterId,
        strength,
        `Hồ sơ điều tra thám tử (độ mạnh ${strength}/100)`,
      );
      await notify(client, {
        userId,
        kind: 'underworld',
        title: 'Thu thập bằng chứng',
        body: `Thám tử đã thu thập bằng chứng độ mạnh ${strength}/100 về mục tiêu.`,
        payload: { evidenceId, targetCharacterId, strength },
      });
      return this.getOverviewWithDb(userId, client);
    });
  }

  /** Bán bằng chứng cho chợ đen (được 40% * độ mạnh * 200.000 ₫). */
  async sellEvidence(userId: string, evidenceId: string): Promise<UnderworldOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const evidence = await this.repository.getEvidence(evidenceId, client);
      if (!evidence) throw AppError.notFound('Evidence');
      if (evidence.status !== 'held') {
        throw AppError.badRequest('Bằng chứng đã được bán / sử dụng.');
      }
      const payout = Math.round(evidence.strength * 0.4 * 200_000);
      await ledger.transfer(client, {
        from: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
        to: { ownerType: 'character', ownerId: character.id },
        amountMinor: payout,
        kind: 'evidence_sale',
        description: 'Bán bằng chứng cho chợ đen',
        referenceType: 'evidence',
        referenceId: evidenceId,
      });
      await this.repository.setEvidenceStatus(client, evidenceId, 'sold');
      await notify(client, {
        userId,
        kind: 'underworld',
        title: 'Bán bằng chứng',
        body: `Đã bán bằng chứng với giá ${payout.toLocaleString('vi-VN')} ₫.`,
        payload: { evidenceId, payout },
      });
      return this.getOverviewWithDb(userId, client);
    });
  }

  /** Nộp bằng chứng cho tòa án: tạo vụ án hình sự cho mục tiêu. */
  async submitEvidence(userId: string, evidenceId: string): Promise<UnderworldOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const evidence = await this.repository.getEvidence(evidenceId, client);
      if (!evidence) throw AppError.notFound('Evidence');
      if (evidence.status === 'submitted') {
        throw AppError.badRequest('Bằng chứng đã nộp tòa.');
      }
      // Tạo vụ án cho target với độ mạnh bằng chứng
      const caseResult = await client.query<{ id: string }>(
        `INSERT INTO court_cases
           (id, defendant_id, plaintiff_type, crime_type, evidence_strength, status)
         VALUES (gen_random_uuid(), $1, 'character', 'fraud', $2, 'trial')
         RETURNING id`,
        [evidence.targetCharacterId, evidence.strength],
      );
      const caseId = caseResult.rows[0]!.id;
      await client.query(
        `INSERT INTO evidences (id, case_id, submitted_by, strength, description)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [caseId, character.id, evidence.strength, evidence.description],
      );
      await this.repository.setEvidenceStatus(client, evidenceId, 'submitted');
      await notify(client, {
        userId,
        kind: 'underworld',
        title: 'Nộp bằng chứng ra tòa',
        body: `Vụ án ${caseId} đã được mở với bằng chứng độ mạnh ${evidence.strength}/100.`,
        payload: { evidenceId, caseId },
      });
      return this.getOverviewWithDb(userId, client);
    });
  }

  /** Mở hợp đồng tống tiền với mục tiêu (dùng bằng chứng có sẵn càng tốt). */
  async startBlackmail(
    userId: string,
    targetCharacterId: string,
    monthlyPaymentMinor: number,
  ): Promise<UnderworldOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      if (targetCharacterId === character.id) {
        throw AppError.badRequest('Không thể tống tiền chính mình.');
      }
      const target = await client.query<{ id: string }>(`SELECT id FROM characters WHERE id = $1`, [
        targetCharacterId,
      ]);
      if (!target.rows[0]) throw AppError.notFound('Target character');
      if (monthlyPaymentMinor <= 0) {
        throw AppError.badRequest('Tiền im lặng hàng tháng phải lớn hơn 0.');
      }
      const blackmailId = await this.repository.createBlackmail(
        client,
        character.id,
        targetCharacterId,
        monthlyPaymentMinor,
      );
      await this.repository.setHeat(client, character.id, applyHeat(character.heat_level, 5));
      await notify(client, {
        userId,
        kind: 'underworld',
        title: 'Mở hợp đồng tống tiền',
        body: `Mục tiêu sẽ phải trả ${monthlyPaymentMinor.toLocaleString('vi-VN')} ₫/tháng.`,
        payload: { blackmailId, targetCharacterId, monthlyPaymentMinor },
      });
      return this.getOverviewWithDb(userId, client);
    });
  }

  /** Thu tiền im lặng tháng này từ mục tiêu (nếu họ còn tiền). */
  async collectBlackmail(userId: string, blackmailId: string): Promise<UnderworldOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const blackmail = await this.repository.getBlackmail(blackmailId, client);
      if (!blackmail) throw AppError.notFound('Blackmail contract');
      if (blackmail.blackmailerId !== character.id) {
        throw AppError.forbidden('Không phải chủ hợp đồng tống tiền.');
      }
      if (blackmail.status !== 'active') {
        throw AppError.badRequest('Hợp đồng đã kết thúc.');
      }
      const amount = Number(blackmail.monthlyPaymentMinor);
      const targetBalance = await ledger.getBalance(client, 'character', blackmail.targetId);
      const payable = Math.min(amount, targetBalance);
      if (payable <= 0) {
        throw AppError.conflict('target_broke', 'Mục tiêu không còn tiền để trả.');
      }
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: blackmail.targetId },
        to: { ownerType: 'character', ownerId: character.id },
        amountMinor: payable,
        kind: 'blackmail_payment',
        description: 'Tiền im lặng hàng tháng',
        referenceType: 'blackmail',
        referenceId: blackmailId,
      });
      await notify(client, {
        userId,
        kind: 'underworld',
        title: 'Thu tiền im lặng',
        body: `Đã thu ${payable.toLocaleString('vi-VN')} ₫ từ mục tiêu.`,
        payload: { blackmailId, payable },
      });
      return this.getOverviewWithDb(userId, client);
    });
  }

  /** Gài bẫy (sting): dùng tiền đánh dấu dụ mục tiêu; catch = target bị mở vụ án. */
  async startSting(
    userId: string,
    targetCharacterId: string,
    amountMinor: number,
  ): Promise<UnderworldOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      if (targetCharacterId === character.id) {
        throw AppError.badRequest('Không thể gài bẫy chính mình.');
      }
      if (amountMinor < 1_000_000) {
        throw AppError.badRequest('Tiền đánh dấu tối thiểu 1.000.000 ₫.');
      }
      const target = await client.query<{ id: string }>(`SELECT id FROM characters WHERE id = $1`, [
        targetCharacterId,
      ]);
      if (!target.rows[0]) throw AppError.notFound('Target character');

      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < amountMinor) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền làm mồi nhử.');
      }
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
        amountMinor,
        kind: 'sting_bait',
        description: 'Tiền đánh dấu gài bẫy',
        referenceType: 'sting',
        referenceId: targetCharacterId,
      });

      // 55% bắt quả tang: target bị mở vụ án, tiền tịch thu về government
      const caught = Math.random() < 0.55;
      const result = caught ? 'caught' : 'failed';
      await this.repository.createSting(
        client,
        character.id,
        targetCharacterId,
        amountMinor,
        result,
      );
      if (caught) {
        await client.query(
          `INSERT INTO court_cases
             (id, defendant_id, plaintiff_type, crime_type, evidence_strength, status)
           VALUES (gen_random_uuid(), $1, 'government', 'fraud', 90, 'trial')`,
          [targetCharacterId],
        );
        await ledger.transfer(client, {
          from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID },
          amountMinor,
          kind: 'sting_seizure',
          description: 'Tịch thu tiền đánh dấu',
          referenceType: 'sting',
          referenceId: targetCharacterId,
        });
      } else {
        await ledger.transfer(client, {
          from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          to: { ownerType: 'character', ownerId: character.id },
          amountMinor,
          kind: 'sting_refund',
          description: 'Hoàn tiền đánh dấu (gài bẫy thất bại)',
          referenceType: 'sting',
          referenceId: targetCharacterId,
        });
      }
      await notify(client, {
        userId,
        kind: 'underworld',
        title: caught ? 'Gài bẫy thành công' : 'Gài bẫy thất bại',
        body: caught
          ? 'Mục tiêu bị bắt quả tang, đã mở vụ án với bằng chứng vững chắc.'
          : 'Mồi nhử không cắn, tiền đã được hoàn trả.',
        payload: { targetCharacterId, amountMinor, result },
      });
      return this.getOverviewWithDb(userId, client);
    });
  }

  /** Mua bảo hiểm / thuê vệ sĩ (phòng thủ). */
  async buyProtection(
    userId: string,
    kind: 'bodyguard' | 'insurance',
  ): Promise<UnderworldOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const premium = kind === 'bodyguard' ? 5_000_000 : 10_000_000;
      const coverage = kind === 'bodyguard' ? 20_000_000 : 100_000_000;
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < premium) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền mua bảo vệ.');
      }
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
        amountMinor: premium,
        kind: 'protection_premium',
        description: kind === 'bodyguard' ? 'Thuê vệ sĩ' : 'Mua bảo hiểm',
        referenceType: 'protection',
      });
      await this.repository.createProtection(client, character.id, kind, coverage, premium);
      // Nhẹ heat một chút: người có vệ sĩ ít bị để ý hơn
      const newHeat = applyHeat(character.heat_level, -2);
      await this.repository.setHeat(client, character.id, newHeat);
      await notify(client, {
        userId,
        kind: 'underworld',
        title: kind === 'bodyguard' ? 'Đã thuê vệ sĩ' : 'Đã mua bảo hiểm',
        body: `Bảo vệ ${coverage.toLocaleString('vi-VN')} ₫ trong 1 năm.`,
        payload: { kind, coverage, premium },
      });
      return this.getOverviewWithDb(userId, client);
    });
  }

  /** Đại án Công an: càn quét khi heat chạm manhunt (>=80). */
  async triggerSweep(userId: string): Promise<UnderworldOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      if (!shouldTriggerSweep(character.heat_level)) {
        throw AppError.badRequest(
          `Heat hiện tại ${character.heat_level} chưa chạm ngưỡng Đại án (80).`,
        );
      }
      await this.runSweep(client, character.id, character.user_id, character.heat_level);
      return this.getOverviewWithDb(userId, client);
    });
  }

  private async runSweep(
    client: PoolClient,
    characterId: string,
    userId: string,
    triggerHeat: number,
  ): Promise<void> {
    const balance = await ledger.getBalance(client, 'character', characterId);
    const fine = Math.round(balance * 0.1);
    const prisonDays = 30;
    if (fine > 0) {
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: characterId },
        to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID },
        amountMinor: fine,
        kind: 'sweep_fine',
        description: 'Đại án Công an: phạt càn quét',
        referenceType: 'sweep',
        referenceId: characterId,
      });
    }
    await client.query(
      `INSERT INTO criminal_records
         (id, character_id, crime_type, fine_minor, prison_days)
       VALUES (gen_random_uuid(), $1, 'heist', $2, $3)`,
      [characterId, fine, prisonDays],
    );
    await this.repository.createSweep(client, characterId, triggerHeat, fine, prisonDays);
    await this.repository.setHeat(client, characterId, 40);
    await this.repository.insertHeatEvent(client, characterId, -40, 'Đại án Công an kết thúc');
    await enqueueDomainEvent(client, {
      type: 'sweep.triggered.v1',
      aggregateType: 'character',
      aggregateId: characterId,
      payload: { characterId, triggerHeat, fine, prisonDays },
    });
    await notify(client, {
      userId,
      kind: 'underworld',
      title: 'Đại án Công an!',
      body: `Càn quét toàn thành phố: phạt ${fine.toLocaleString('vi-VN')} ₫, giam ${prisonDays} ngày. Heat hạ xuống 40.`,
      payload: { triggerHeat, fine, prisonDays },
    });
  }
}

export const underworldService = new UnderworldService();
