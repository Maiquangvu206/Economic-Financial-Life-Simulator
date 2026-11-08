import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import { type SocialOverviewDto, type WillDto, MoneySchema } from '@efls/contracts';
import { socialRepository } from './social.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

/** Dịch vụ xã hội: hôn nhân/prenup, cây gia tộc, di chúc, trust fund. */
export class SocialService {
  constructor(private readonly repository = socialRepository) {}

  async getOverview(
    userId: string,
    dbOverride?: Parameters<typeof this.repository.listMarriages>[1],
  ): Promise<SocialOverviewDto> {
    const db = dbOverride ?? this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const [marriages, family, will, trustFunds] = await Promise.all([
      this.repository.listMarriages(character.id, db),
      this.repository.listFamily(character.id, db),
      this.repository.getWill(character.id, db),
      this.repository.listTrustFunds(character.id, db),
    ]);

    const activeMarriage = marriages.find((m) => m.status === 'active');
    const spouse =
      activeMarriage != null
        ? activeMarriage.characterId === character.id
          ? { characterId: activeMarriage.spouseId, characterName: activeMarriage.spouseName }
          : { characterId: activeMarriage.characterId, characterName: activeMarriage.characterName }
        : null;

    const trustFundTotal = trustFunds.reduce((sum, t) => sum + Number(t.balanceMinor), 0);
    const willDto: WillDto =
      will != null
        ? {
            id: will.id,
            primaryHeirId: will.primaryHeirId,
            primaryHeirName: will.primaryHeirName,
            trustFundEnabled: will.trustFundEnabled,
            updatedAt: will.updatedAt?.toISOString() ?? null,
          }
        : {
            id: null,
            primaryHeirId: null,
            primaryHeirName: null,
            trustFundEnabled: false,
            updatedAt: null,
          };

    return {
      maritalStatus: character.marital_status as SocialOverviewDto['maritalStatus'],
      spouse,
      marriages: marriages.map((m) => ({
        id: m.id,
        characterId: m.characterId,
        characterName: m.characterName,
        spouseId: m.spouseId,
        spouseName: m.spouseName,
        prenupEnabled: m.prenupEnabled,
        status: m.status as 'active' | 'divorced' | 'widowed',
        marriedAt: m.marriedAt.toISOString(),
        endedAt: m.endedAt?.toISOString() ?? null,
      })),
      family: family.map((f) => ({
        characterId: f.characterId,
        characterName: f.characterName,
        relationship: f.relationship,
        parentId: f.parentId,
        generationLevel: f.generationLevel,
        inheritancePct: Number(f.inheritancePct),
      })),
      will: willDto,
      trustFunds: trustFunds.map((t) => ({
        id: t.id,
        beneficiaryId: t.beneficiaryId,
        beneficiaryName: t.beneficiaryName,
        balance: money(Number(t.balanceMinor)),
      })),
      trustFundTotal: money(trustFundTotal),
    };
  }

  /** Kết hôn với một nhân vật khác (cần spouseCharacterId). */
  async marry(
    userId: string,
    spouseCharacterId: string,
    prenupEnabled: boolean,
  ): Promise<SocialOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      if (spouseCharacterId === character.id) {
        throw AppError.badRequest('Không thể kết hôn với chính mình.');
      }
      const spouse = await client.query<{ id: string; marital_status: string }>(
        `SELECT id, marital_status FROM characters WHERE id = $1`,
        [spouseCharacterId],
      );
      if (!spouse.rows[0]) throw AppError.notFound('Spouse character');
      if (character.marital_status === 'married' || spouse.rows[0].marital_status === 'married') {
        throw AppError.conflict('already_married', 'Một bên đã kết hôn.');
      }

      const marriageId = await this.repository.createMarriage(
        client,
        character.id,
        spouseCharacterId,
        prenupEnabled,
      );

      await client.query(
        `UPDATE characters SET marital_status = 'married', spouse_id = $2, updated_at = now() WHERE id = $1`,
        [character.id, spouseCharacterId],
      );
      await client.query(
        `UPDATE characters SET marital_status = 'married', spouse_id = $2, updated_at = now() WHERE id = $1`,
        [spouseCharacterId, character.id],
      );

      await notify(client, {
        userId,
        kind: 'social',
        title: 'Kết hôn',
        body: prenupEnabled
          ? `Bạn đã kết hôn với hợp đồng prenup (chung tài sản có giới hạn).`
          : `Bạn đã kết hôn.`,
        payload: { marriageId, spouseCharacterId, prenupEnabled },
      });
      return this.getOverview(userId, client);
    });
  }

  /** Ly hôn: kết thúc hợp đồng hôn nhân. */
  async divorce(userId: string, marriageId: string): Promise<SocialOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const marriage = await this.repository.getMarriage(marriageId, client);
      if (!marriage) throw AppError.notFound('Marriage');
      if (marriage.status !== 'active') {
        throw AppError.badRequest('Hôn nhân này đã kết thúc.');
      }
      if (marriage.characterId !== character.id && marriage.spouseId !== character.id) {
        throw AppError.forbidden('Bạn không phải là thành viên của hôn nhân này.');
      }

      await this.repository.endMarriage(client, marriageId, 'divorced');
      await client.query(
        `UPDATE characters SET marital_status = 'divorced', spouse_id = NULL, updated_at = now() WHERE id = $1`,
        [character.id],
      );
      const otherId =
        marriage.characterId === character.id ? marriage.spouseId : marriage.characterId;
      await client.query(
        `UPDATE characters SET marital_status = 'divorced', spouse_id = NULL, updated_at = now() WHERE id = $1`,
        [otherId],
      );

      await notify(client, {
        userId,
        kind: 'social',
        title: 'Ly hôn',
        body: 'Hôn nhân đã kết thúc. Tài sản được phân chia theo hợp đồng prenup (nếu có).',
        payload: { marriageId, prenupEnabled: marriage.prenupEnabled },
      });
      return this.getOverview(userId, client);
    });
  }

  /** Lập / cập nhật di chúc. */
  async upsertWill(
    userId: string,
    primaryHeirId: string | null,
    trustFundEnabled: boolean,
  ): Promise<WillDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const will = await this.repository.upsertWill(
        client,
        character.id,
        primaryHeirId,
        trustFundEnabled,
      );
      if (trustFundEnabled) {
        await this.repository.createTrustFund(client, character.id);
      }
      await notify(client, {
        userId,
        kind: 'social',
        title: 'Cập nhật di chúc',
        body: 'Di chúc của bạn đã được cập nhật.',
        payload: { willId: will.id, primaryHeirId, trustFundEnabled },
      });
      return {
        id: will.id,
        primaryHeirId: will.primaryHeirId,
        primaryHeirName: will.primaryHeirName,
        trustFundEnabled: will.trustFundEnabled,
        updatedAt: will.updatedAt?.toISOString() ?? null,
      };
    });
  }

  /** Nạp tiền vào quỹ tín thác (trust fund) của mình. */
  async depositTrustFund(userId: string, amountMinor: number): Promise<SocialOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      if (amountMinor <= 0) {
        throw AppError.badRequest('Số tiền nạp quỹ tín thác phải lớn hơn 0.');
      }
      const trustFundId = await this.repository.createTrustFund(client, character.id);
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
        amountMinor,
        kind: 'trust_fund_deposit',
        description: 'Nạp quỹ tín thác',
        referenceType: 'trust_fund',
        referenceId: trustFundId,
      });
      await this.repository.depositTrustFund(client, character.id, amountMinor);
      await notify(client, {
        userId,
        kind: 'social',
        title: 'Nạp quỹ tín thác',
        body: `Bạn đã nạp ${amountMinor} VND vào quỹ tín thác.`,
        payload: { trustFundId, amountMinor },
      });
      return this.getOverview(userId, client);
    });
  }
}

export const socialService = new SocialService();
