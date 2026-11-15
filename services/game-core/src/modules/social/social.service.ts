import type { PoolClient } from 'pg';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId, resolveCharacterByCccd } from '../../shared/actors/character.js';
import { ledger } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import { type SocialOverviewDto, type WillDto, MoneySchema } from '@efls/contracts';
import { maskCccd } from '@efls/domain';
import { socialRepository } from './social.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

/** Dịch vụ xã hội: hôn nhân/ly hôn có đồng thuận 2 bên, gia tộc, di chúc, trust fund. */
export class SocialService {
  constructor(private readonly repository = socialRepository) {}

  async getOverview(
    userId: string,
    dbOverride?: Parameters<typeof this.repository.listMarriages>[1],
  ): Promise<SocialOverviewDto> {
    const db = dbOverride ?? this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const [marriages, marriageProposals, divorceProposals, family, will, trustFunds] = await Promise.all([
      this.repository.listMarriages(character.id, db),
      this.repository.listMarriageProposals(character.id, db),
      this.repository.listDivorceProposals(character.id, db),
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
    const willBeneficiaries = will ? await (this.repository as any).listWillBeneficiaries(will.id, db) : [];
    const legacyWillHeirs = will && willBeneficiaries.length === 0 ? await this.repository.listWillHeirs(will.id, db) : [];
    const heirsDto = willBeneficiaries.length > 0
      ? willBeneficiaries.map((h: any) => ({
          beneficiaryCccd: h.beneficiaryCccd,
          beneficiaryName: h.beneficiaryName ?? null,
          characterId: h.beneficiaryCharacterId ?? undefined,
          characterName: h.beneficiaryName ?? undefined,
          sharePct: Number(h.sharePct),
          relationship: h.relationship,
          note: h.note,
        }))
      : legacyWillHeirs.map((h) => ({
          characterId: h.characterId,
          characterName: h.characterName,
          sharePct: Number(h.sharePct),
          relationship: h.relationship,
          note: h.note,
        }));
    const primary = heirsDto[0] as any;
    const willDto: WillDto =
      will != null
        ? {
            id: will.id,
            primaryHeirId: primary?.characterId ?? will.primaryHeirId ?? null,
            primaryHeirName: primary?.beneficiaryName ?? primary?.characterName ?? will.primaryHeirName ?? null,
            heirs: heirsDto as any,
            trustFundEnabled: will.trustFundEnabled,
            updatedAt: will.updatedAt?.toISOString() ?? null,
          }
        : {
            id: null,
            primaryHeirId: null,
            primaryHeirName: null,
            heirs: [],
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
      marriageProposals: marriageProposals.map((p) => ({
        id: p.id,
        proposerCharacterId: p.proposerCharacterId,
        proposerName: p.proposerName,
        targetCharacterId: p.targetCharacterId,
        targetName: p.targetName,
        prenupEnabled: p.prenupEnabled,
        status: p.status as 'pending' | 'accepted' | 'rejected' | 'cancelled',
        createdAt: p.createdAt.toISOString(),
        respondedAt: p.respondedAt?.toISOString() ?? null,
      })),
      divorceProposals: divorceProposals.map((p) => ({
        id: p.id,
        marriageId: p.marriageId,
        requesterCharacterId: p.requesterCharacterId,
        requesterName: p.requesterName,
        otherCharacterId: p.otherCharacterId,
        otherName: p.otherName,
        status: p.status as 'pending' | 'accepted' | 'rejected' | 'cancelled',
        createdAt: p.createdAt.toISOString(),
        respondedAt: p.respondedAt?.toISOString() ?? null,
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
      trustFunds: await Promise.all(trustFunds.map(async (t) => {
        const beneficiaries = await (this.repository as any).listTrustFundBeneficiaries(t.id, db);
        return {
          id: t.id,
          beneficiaryId: t.beneficiaryId,
          beneficiaryName: t.beneficiaryName,
          beneficiaries: beneficiaries.map((b: any) => ({
            beneficiaryCccd: b.beneficiaryCccd,
            beneficiaryName: b.beneficiaryName ?? null,
            sharePct: Number(b.sharePct),
          })),
          balance: money(Number(t.balanceMinor)),
        };
      })),
      trustFundTotal: money(trustFundTotal),
    };
  }

  /** Gửi lời cầu hôn (cần người kia đồng ý). */
  async proposeMarriage(
    userId: string,
    spouse: { spouseCccd?: string; spouseCharacterId?: string } | string,
    prenupEnabled: boolean,
  ): Promise<SocialOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const spouseInput = typeof spouse === 'string' ? { spouseCharacterId: spouse } : spouse;
      const targetRef = spouseInput.spouseCccd
        ? await resolveCharacterByCccd(client, spouseInput.spouseCccd, { requireAlive: true })
        : spouseInput.spouseCharacterId
          ? await (async () => {
              const r = await client.query<any>(`SELECT id, is_alive, marital_status, user_id FROM characters WHERE id = $1`, [spouseInput.spouseCharacterId]);
              if (!r.rows[0]) throw AppError.notFound('Spouse character');
              if (r.rows[0].is_alive === false) throw AppError.conflict('character_dead', 'Người kia đã qua đời.');
              return r.rows[0];
            })()
          : null;
      if (!targetRef) throw AppError.badRequest('Thiếu người được cầu hôn (CCCD).');
      const spouseCharacterId = targetRef.id as string;
      if (spouseCharacterId === character.id) {
        throw AppError.badRequest('Không thể kết hôn với chính mình.');
      }
      const spouseRow = await client.query<{ id: string; marital_status: string; user_id: string | null; is_alive: boolean }>(
        `SELECT id, marital_status, user_id, COALESCE(is_alive,true) AS is_alive FROM characters WHERE id = $1`,
        [spouseCharacterId],
      );
      const sp = spouseRow.rows[0];
      if (!sp) throw AppError.notFound('Spouse character');
      if (sp.is_alive === false) throw AppError.conflict('character_dead', 'Người kia đã qua đời.');
      if (character.marital_status === 'married') {
        throw AppError.conflict('already_married', 'Bạn đã kết hôn.');
      }
      if (sp.marital_status === 'married') {
        throw AppError.conflict('already_married', 'Người kia đã kết hôn.');
      }
      const existing = await this.repository.findPendingMarriageProposal(character.id, spouseCharacterId, client);
      if (existing) {
        throw AppError.conflict('proposal_exists', 'Đã có lời cầu hôn đang chờ giữa hai người.');
      }

      const proposalId = await this.repository.createMarriageProposal(client, character.id, spouseCharacterId, prenupEnabled);

      if (sp.user_id) {
        await notify(client, {
          userId: sp.user_id,
          kind: 'social',
          title: 'Lời cầu hôn',
          body: `${character.full_name} đã gửi lời cầu hôn${prenupEnabled ? ' (có prenup)' : ''}. Bạn cần đồng ý để kết hôn.`,
          payload: { proposalId, fromCharacterId: character.id, prenupEnabled },
        });
      }
      await notify(client, {
        userId,
        kind: 'social',
        title: 'Đã gửi lời cầu hôn',
        body: 'Lời cầu hôn đã được gửi và đang chờ đối phương đồng ý.',
        payload: { proposalId, toCharacterId: spouseCharacterId, prenupEnabled },
      });
      return this.getOverview(userId, client);
    });
  }

  /** Phản hồi lời cầu hôn (chỉ người được cầu hôn). accept=true để kết hôn. */
  async respondMarriageProposal(userId: string, proposalId: string, accept: boolean): Promise<SocialOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const proposal = await this.repository.getMarriageProposal(proposalId, client);
      if (!proposal) throw AppError.notFound('Marriage proposal');
      if (proposal.status !== 'pending') throw AppError.badRequest('Lời cầu hôn này không còn chờ phản hồi.');
      if (proposal.targetCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ người được cầu hôn mới có thể phản hồi.');
      }

      if (!accept) {
        await this.repository.setMarriageProposalStatus(client, proposalId, 'rejected');
        const proposerUserId = await this.repository.getUserIdByCharacterId(proposal.proposerCharacterId, client);
        if (proposerUserId) {
          await notify(client, { userId: proposerUserId, kind: 'social', title: 'Cầu hôn bị từ chối', body: `${character.full_name} đã từ chối lời cầu hôn.`, payload: { proposalId } });
        }
        return this.getOverview(userId, client);
      }

      // Accept: re-check both single and marry
      const chars = await client.query<{ id: string; marital_status: string; user_id: string }>(
        `SELECT id, marital_status, user_id FROM characters WHERE id = $1 OR id = $2 FOR UPDATE`,
        [proposal.proposerCharacterId, proposal.targetCharacterId],
      );
      const proposer = chars.rows.find((r) => r.id === proposal.proposerCharacterId);
      const target = chars.rows.find((r) => r.id === proposal.targetCharacterId);
      if (!proposer || !target) throw AppError.notFound('Character');
      if (proposer.marital_status === 'married' || target.marital_status === 'married') {
        await this.repository.setMarriageProposalStatus(client, proposalId, 'cancelled');
        throw AppError.conflict('already_married', 'Một bên đã kết hôn, không thể chấp nhận lời cầu hôn.');
      }

      const marriageId = await this.repository.createMarriage(client, proposal.proposerCharacterId, proposal.targetCharacterId, proposal.prenupEnabled);
      await client.query(`UPDATE characters SET marital_status = 'married', spouse_id = $2, updated_at = now() WHERE id = $1`, [proposal.proposerCharacterId, proposal.targetCharacterId]);
      await client.query(`UPDATE characters SET marital_status = 'married', spouse_id = $2, updated_at = now() WHERE id = $1`, [proposal.targetCharacterId, proposal.proposerCharacterId]);
      await this.repository.setMarriageProposalStatus(client, proposalId, 'accepted');

      const msg = proposal.prenupEnabled ? 'Hai bên đã đồng ý kết hôn (có prenup).' : 'Hai bên đã đồng ý kết hôn.';
      await notify(client, { userId: proposer.user_id, kind: 'social', title: 'Kết hôn thành công', body: msg, payload: { marriageId, proposalId, prenupEnabled: proposal.prenupEnabled } });
      await notify(client, { userId: target.user_id, kind: 'social', title: 'Kết hôn thành công', body: msg, payload: { marriageId, proposalId, prenupEnabled: proposal.prenupEnabled } });
      return this.getOverview(userId, client);
    });
  }

  /** Alias: gửi yêu cầu kết hôn (cần đối phương đồng ý). */
  async marry(userId: string, spouse: { spouseCccd?: string; spouseCharacterId?: string } | string, prenupEnabled: boolean): Promise<SocialOverviewDto> {
    return this.proposeMarriage(userId, spouse, prenupEnabled);
  }

  /** Gửi yêu cầu ly hôn (cần người còn lại đồng ý). Đồng thời chụp snapshot & kích hoạt phong tỏa tài sản.
   *  Nếu đối phương bị khóa/không thể xác thực (tài khoản bị khóa/hạn chế, hoặc nhân vật không còn hoạt động),
   *  cho phép người còn lại ly hôn đơn phương ngay (không cần chờ xác thực). */
  async proposeDivorce(userId: string, marriageId: string): Promise<SocialOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const marriage = await this.repository.getMarriage(marriageId, client);
      if (!marriage) throw AppError.notFound('Marriage');
      if (marriage.status !== 'active') throw AppError.badRequest('Hôn nhân này đã kết thúc.');
      if (marriage.characterId !== character.id && marriage.spouseId !== character.id) {
        throw AppError.forbidden('Bạn không phải là thành viên của hôn nhân này.');
      }

      const otherId = marriage.characterId === character.id ? marriage.spouseId : marriage.characterId;

      const otherInfoRes = await client.query<{
        id: string;
        user_id: string | null;
        is_alive: boolean;
        user_status: string | null;
      }>(
        `SELECT c.id, c.user_id, COALESCE(c.is_alive, true) AS is_alive, u.status AS user_status
         FROM characters c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.id = $1
         FOR UPDATE`,
        [otherId],
      );
      const otherInfo = otherInfoRes.rows[0];
      const otherLocked =
        !otherInfo ||
        otherInfo.is_alive === false ||
        !otherInfo.user_id ||
        otherInfo.user_status === 'banned' ||
        otherInfo.user_status === 'restricted';

      let pending = await this.repository.findPendingDivorceProposal(marriageId, client);
      let proposalId = pending;

      if (pending) {
        if (!otherLocked) {
          throw AppError.conflict('proposal_exists', 'Đã có yêu cầu ly hôn đang chờ phản hồi.');
        }
        // Đối phương hiện bị khóa/không thể xác thực: cho phép hoàn tất ly hôn đơn phương từ yêu cầu đang chờ.
      } else {
        proposalId = await this.repository.createDivorceProposal(client, marriageId, character.id);
      }
      if (!proposalId) throw new Error('Không tạo/khởi tạo được yêu cầu ly hôn');

      // Snapshot: chụp tiền mặt + BĐS sở hữu cá nhân (không đấu giá) tại thời điểm gửi yêu cầu / đơn phương
      const chars = await client.query<{ id: string; cash_minor: string }>(
        `SELECT id, cash_minor FROM characters WHERE id = $1 OR id = $2 FOR UPDATE`,
        [character.id, otherId],
      );
      const props = await client.query<{ id: string; owner_character_id: string; current_value_minor: string; status: string }>(
        `SELECT p.id, p.owner_character_id, p.current_value_minor, p.status
         FROM properties p
         WHERE p.owner_character_id = $1 OR p.owner_character_id = $2
         FOR UPDATE`,
        [character.id, otherId],
      );
      for (const cid of [character.id, otherId]) {
        const cRow = chars.rows.find((r) => r.id === cid);
        const cash = Number(cRow?.cash_minor ?? 0);
        const owned = props.rows.filter((p) => p.owner_character_id === cid && p.status !== 'auction');
        const propValue = owned.reduce((s, p) => s + Number(p.current_value_minor), 0);
        const propIds = owned.map((p) => p.id);
        await client.query(
          `INSERT INTO divorce_proposal_snapshots (id, proposal_id, character_id, cash_minor, property_value_minor, property_ids, total_minor)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::uuid[], $6)
           ON CONFLICT (proposal_id, character_id) DO UPDATE SET cash_minor=EXCLUDED.cash_minor, property_value_minor=EXCLUDED.property_value_minor, property_ids=EXCLUDED.property_ids, total_minor=EXCLUDED.total_minor`,
          [proposalId, cid, cash, propValue, propIds, cash + propValue],
        );
      }

      if (otherLocked) {
        // Ly hôn đơn phương: đối phương bị khóa/không thể xác thực.
        const result = await this.executeDivorce(client, marriage.id, marriage.characterId, marriage.spouseId, marriage.prenupEnabled, proposalId);
        await this.repository.setDivorceProposalStatus(client, proposalId, 'accepted');
        const reason = !otherInfo || otherInfo.is_alive === false
          ? 'đối phương không còn hoạt động'
          : otherInfo.user_status === 'banned'
            ? 'đối phương đang bị khóa tài khoản'
            : otherInfo.user_status === 'restricted'
              ? 'đối phương đang bị hạn chế tài khoản'
              : 'đối phương không thể xác thực';
        const body = `${result.body} (Ly hôn đơn phương do ${reason}, không cần chờ xác thực.)`;
        await notify(client, {
          userId,
          kind: 'social',
          title: 'Ly hôn đơn phương hoàn tất',
          body,
          payload: { proposalId, marriageId, unilateral: true, reason, split: result.split, prenupEnabled: marriage.prenupEnabled },
        });
        const otherUserId = await this.repository.getUserIdByCharacterId(otherId, client);
        if (otherUserId) {
          await notify(client, {
            userId: otherUserId,
            kind: 'social',
            title: 'Ly hôn đơn phương',
            body: `${character.full_name} đã thực hiện ly hôn đơn phương (${reason}). ${result.body}`,
            payload: { proposalId, marriageId, unilateral: true, reason, split: result.split, prenupEnabled: marriage.prenupEnabled },
          });
        }
        return this.getOverview(userId, client);
      }

      const otherUserId = await this.repository.getUserIdByCharacterId(otherId, client);
      if (otherUserId) {
        await notify(client, {
          userId: otherUserId,
          kind: 'social',
          title: 'Yêu cầu ly hôn',
          body: `${character.full_name} đã gửi yêu cầu ly hôn. Tài sản hai bên đã được chụp mốc và tạm phong tỏa; bạn cần đồng ý để hoàn tất ly hôn.`,
          payload: { proposalId, marriageId, fromCharacterId: character.id },
        });
      }
      await notify(client, { userId, kind: 'social', title: 'Đã gửi yêu cầu ly hôn', body: 'Yêu cầu ly hôn đã được gửi. Tài sản hai bên đã được chụp mốc và tạm phong tỏa trong khi chờ đối phương đồng ý.', payload: { proposalId, marriageId } });
      return this.getOverview(userId, client);
    });
  }
  /** Phản hồi yêu cầu ly hôn (chỉ người còn lại). accept=true để ly hôn (v1: chia tài sản). */
  async respondDivorceProposal(userId: string, proposalId: string, accept: boolean): Promise<SocialOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const proposal = await this.repository.getDivorceProposal(proposalId, client);
      if (!proposal) throw AppError.notFound('Divorce proposal');
      if (proposal.status !== 'pending') throw AppError.badRequest('Yêu cầu ly hôn này không còn chờ phản hồi.');
      if (proposal.otherCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ người còn lại trong hôn nhân mới có thể phản hồi yêu cầu ly hôn.');
      }
      const marriage = await this.repository.getMarriage(proposal.marriageId, client);
      if (!marriage || marriage.status !== 'active') {
        await this.repository.setDivorceProposalStatus(client, proposalId, 'cancelled');
        throw AppError.badRequest('Hôn nhân không còn hiệu lực.');
      }

      if (!accept) {
        await this.repository.setDivorceProposalStatus(client, proposalId, 'rejected');
        const requesterUserId = await this.repository.getUserIdByCharacterId(proposal.requesterCharacterId, client);
        if (requesterUserId) {
          await notify(client, { userId: requesterUserId, kind: 'social', title: 'Yêu cầu ly hôn bị từ chối', body: `${character.full_name} đã từ chối yêu cầu ly hôn.`, payload: { proposalId, marriageId: proposal.marriageId } });
        }
        return this.getOverview(userId, client);
      }

      // Accept: thực hiện ly hôn + chia tài sản (áp dụng snapshot bù trừ tẩu tán)
      const result = await this.executeDivorce(client, marriage.id, marriage.characterId, marriage.spouseId, marriage.prenupEnabled, proposalId);
      await this.repository.setDivorceProposalStatus(client, proposalId, 'accepted');

      const requesterUserId = await this.repository.getUserIdByCharacterId(proposal.requesterCharacterId, client);
      const otherUserId = await this.repository.getUserIdByCharacterId(proposal.otherCharacterId, client);
      const payload = { proposalId, marriageId: marriage.id, prenupEnabled: marriage.prenupEnabled, split: result.split };
      if (requesterUserId) await notify(client, { userId: requesterUserId, kind: 'social', title: 'Ly hôn hoàn tất', body: result.body, payload });
      if (otherUserId) await notify(client, { userId: otherUserId, kind: 'social', title: 'Ly hôn hoàn tất', body: result.body, payload });
      return this.getOverview(userId, client);
    });
  }

  /** Alias: gửi yêu cầu ly hôn (cần đối phương đồng ý). */
  async divorce(userId: string, marriageId: string): Promise<SocialOverviewDto> {
    return this.proposeDivorce(userId, marriageId);
  }

  /** Thực thi ly hôn + chia tài sản v2 (gọi trong transaction).
   *  - Không prenup: chia 50/50 tài sản chung (tiền mặt + BĐS sở hữu cá nhân, trừ đấu giá mở).
   *    Có snapshot tại thời điểm gửi yêu cầu ly hôn: phần tài sản giảm so với snapshot (tẩu tán) được bù trừ vào bên gây ra.
   *  - Có prenup: không tự động phân chia.
   */
  private async executeDivorce(
    client: PoolClient,
    marriageId: string,
    characterIdA: string,
    characterIdB: string,
    prenupEnabled: boolean,
    proposalId?: string,
  ): Promise<{ body: string; split: { transferred: number; fromCharacterId: string; toCharacterId: string } | null }> {
    const charsRes = await client.query<{ id: string; cash_minor: string }>(
      `SELECT id, cash_minor FROM characters WHERE id = $1 OR id = $2 FOR UPDATE`,
      [characterIdA, characterIdB],
    );
    const a = charsRes.rows.find((r) => r.id === characterIdA);
    const b = charsRes.rows.find((r) => r.id === characterIdB);
    if (!a || !b) throw AppError.notFound('Character');

    let split: { transferred: number; fromCharacterId: string; toCharacterId: string } | null = null;
    let body = '';

    if (!prenupEnabled) {
      const propsRes = await client.query<{ id: string; owner_character_id: string; current_value_minor: string; status: string }>(
        `SELECT p.id, p.owner_character_id, p.current_value_minor, p.status
         FROM properties p
         WHERE p.owner_character_id = $1 OR p.owner_character_id = $2
         FOR UPDATE`,
        [characterIdA, characterIdB],
      );
      const allProps = propsRes.rows;
      const divisibleProps = allProps.filter((p) => p.status !== 'auction');
      const excludedAuction = allProps.length - divisibleProps.length;

      if (divisibleProps.length > 0) {
        const propIds = divisibleProps.map((p) => p.id);
        await client.query(
          `UPDATE property_sale_offers SET status = 'cancelled', resolved_at = now(), updated_at = now()
           WHERE property_id = ANY($1::uuid[]) AND status = 'pending'`,
          [propIds],
        );
        await client.query(
          `UPDATE auctions SET status = 'cancelled', updated_at = now()
           WHERE property_id = ANY($1::uuid[]) AND status = 'open'`,
          [propIds],
        );
      }

      const cashA = Number(a.cash_minor);
      const cashB = Number(b.cash_minor);
      const items = divisibleProps.map((p) => ({ id: p.id, owner: p.owner_character_id, value: Number(p.current_value_minor) }));
      const totalPropValue = items.reduce((s, it) => s + it.value, 0);

      // Snapshot bù trừ tẩu tán (nếu có)
      let snapA = cashA + items.filter((it) => it.owner === characterIdA).reduce((s, it) => s + it.value, 0);
      let snapB = cashB + items.filter((it) => it.owner === characterIdB).reduce((s, it) => s + it.value, 0);
      let shortfallA = 0;
      let shortfallB = 0;
      if (proposalId) {
        const snaps = await client.query<{ character_id: string; total_minor: string; property_ids: string[] }>(
          `SELECT character_id, total_minor, property_ids FROM divorce_proposal_snapshots WHERE proposal_id = $1`,
          [proposalId],
        );
        const byChar = new Map(snaps.rows.map((r) => [r.character_id, r]));
        const sa = byChar.get(characterIdA);
        const sb = byChar.get(characterIdB);
        if (sa && sb) {
          snapA = Number(sa.total_minor);
          snapB = Number(sb.total_minor);
          const currentFor = (cid: string, cash: number, snapPropIds: string[] | null) => {
            const ids = snapPropIds ?? [];
            const stillOwnedValue = items
              .filter((it) => it.owner === cid && ids.includes(it.id))
              .reduce((s, it) => s + it.value, 0);
            return cash + stillOwnedValue;
          };
          shortfallA = Math.max(0, snapA - currentFor(characterIdA, cashA, sa.property_ids));
          shortfallB = Math.max(0, snapB - currentFor(characterIdB, cashB, sb.property_ids));
        }
      }

      const pool = snapA + snapB;
      const targetA = Math.floor(pool / 2) - shortfallA;
      const targetB = pool - Math.floor(pool / 2) - shortfallB;

      const assignedA: typeof items = [];
      const assignedB: typeof items = [];
      for (const it of items) {
        if (it.owner === characterIdA) assignedA.push(it); else assignedB.push(it);
      }
      const sum = (arr: typeof items) => arr.reduce((s, it) => s + it.value, 0);
      let improved = true;
      let guard = 0;
      while (improved && guard++ < 500) {
        improved = false;
        const valAcur = sum(assignedA);
        const diff = valAcur - targetA;
        if (diff === 0) break;
        const from = diff > 0 ? assignedA : assignedB;
        let bestIdx = -1;
        let bestScore = Math.abs(diff);
        for (let i = 0; i < from.length; i++) {
          const v = from[i]!.value;
          const newDiffAbs = Math.abs((valAcur - (diff > 0 ? v : -v)) - targetA);
          if (newDiffAbs < bestScore) { bestScore = newDiffAbs; bestIdx = i; }
        }
        if (bestIdx >= 0) {
          const [moved] = from.splice(bestIdx, 1);
          if (moved) { (diff > 0 ? assignedB : assignedA).push(moved); improved = true; }
        }
      }

      const valA = sum(assignedA);
      const valB = sum(assignedB);
      for (const it of assignedA) {
        await client.query(
          `UPDATE properties SET owner_character_id = $2, owner_company_id = NULL, status = 'owned', asking_price_minor = NULL, sale_notes = NULL, updated_at = now() WHERE id = $1`,
          [it.id, characterIdA],
        );
      }
      for (const it of assignedB) {
        await client.query(
          `UPDATE properties SET owner_character_id = $2, owner_company_id = NULL, status = 'owned', asking_price_minor = NULL, sale_notes = NULL, updated_at = now() WHERE id = $1`,
          [it.id, characterIdB],
        );
      }

      const desiredCashA = targetA - valA;
      const desiredCashB = targetB - valB;
      let transferAmount = 0;
      let fromId = characterIdA;
      let toId = characterIdB;
      if (desiredCashA < 0) {
        transferAmount = Math.min(cashA, -desiredCashA);
        fromId = characterIdA; toId = characterIdB;
      } else if (desiredCashB < 0) {
        transferAmount = Math.min(cashB, -desiredCashB);
        fromId = characterIdB; toId = characterIdA;
      } else {
        const deltaA = desiredCashA - cashA;
        if (deltaA > 0) { transferAmount = Math.min(cashB, deltaA); fromId = characterIdB; toId = characterIdA; }
        else if (deltaA < 0) { transferAmount = Math.min(cashA, -deltaA); fromId = characterIdA; toId = characterIdB; }
      }

      if (transferAmount > 0) {
        await ledger.transfer(client, {
          from: { ownerType: 'character', ownerId: fromId },
          to: { ownerType: 'character', ownerId: toId },
          amountMinor: transferAmount,
          kind: 'divorce_asset_split',
          description: 'Phân chia tài sản khi ly hôn (không prenup: tiền mặt + BĐS, 50/50, có bù trừ)',
          referenceType: 'marriage',
          referenceId: marriageId,
        });
        split = { transferred: transferAmount, fromCharacterId: fromId, toCharacterId: toId };
      }

      const movedToA = assignedA.filter((it) => it.owner !== characterIdA).length;
      const movedToB = assignedB.filter((it) => it.owner !== characterIdB).length;
      const parts: string[] = [];
      parts.push('chia 50/50 tài sản chung (tiền mặt + BĐS)');
      if (movedToA + movedToB > 0) parts.push(`chuyển quyền ${movedToA + movedToB} bất động sản`);
      if (transferAmount > 0) parts.push(`bù tiền ${transferAmount.toLocaleString('vi-VN')} ₫`);
      if (shortfallA + shortfallB > 0) parts.push(`bù trừ tẩu tán ${ (shortfallA + shortfallB).toLocaleString('vi-VN') } ₫`);
      if (excludedAuction > 0) parts.push(`không chia ${excludedAuction} BĐS đang đấu giá`);
      const finalCashA = cashA + (toId === characterIdA ? transferAmount : 0) - (fromId === characterIdA ? transferAmount : 0);
      const finalCashB = cashB + (toId === characterIdB ? transferAmount : 0) - (fromId === characterIdB ? transferAmount : 0);
      const imbalance = Math.abs((finalCashA + valA + shortfallA) - (finalCashB + valB + shortfallB));
      if (imbalance > 1) parts.push(`chênh lệch còn ${imbalance.toLocaleString('vi-VN')} ₫ do BĐS không chia nhỏ/giới hạn tiền mặt`);
      body = `Hôn nhân đã kết thúc. Không có prenup: ${parts.join(', ')}.`;
    } else {
      body = 'Hôn nhân đã kết thúc. Có prenup: không tự động phân chia tài sản.';
    }

    await this.repository.endMarriage(client, marriageId, 'divorced');
    await client.query(`UPDATE characters SET marital_status = 'divorced', spouse_id = NULL, updated_at = now() WHERE id = $1`, [characterIdA]);
    await client.query(`UPDATE characters SET marital_status = 'divorced', spouse_id = NULL, updated_at = now() WHERE id = $1`, [characterIdB]);

    return { body, split };
  }

  /** Lập / cập nhật di chúc theo CCCD (will_beneficiaries), tổng tỉ lệ <= 100%. */
  async upsertWill(
    userId: string,
    input: {
      heirs?: Array<{ beneficiaryCccd?: string; characterId?: string; sharePct: number; relationship?: string; note?: string | null }>;
      primaryHeirId?: string | null;
      trustFundEnabled: boolean;
    },
  ): Promise<WillDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);

      let heirs = (input.heirs ?? []).map((h) => ({
        beneficiaryCccd: h.beneficiaryCccd ? String(h.beneficiaryCccd).replace(/\s+/g, '') : undefined,
        characterId: h.characterId,
        sharePct: Number(h.sharePct),
        relationship: (h.relationship && h.relationship.trim()) || 'Người thừa kế',
        note: h.note ?? null,
      }));

      const resolved: Array<{ beneficiaryCccd: string; beneficiaryCharacterId: string | null; sharePct: number; relationship: string; note: string | null }> = [];
      const seen = new Set<string>();
      for (const h of heirs) {
        let cccd = h.beneficiaryCccd;
        let charId: string | null = h.characterId ?? null;
        if (!cccd && charId) {
          const r = await client.query<{ cccd: string | null; user_id: string | null; is_alive: boolean }>(`SELECT cccd, user_id, COALESCE(is_alive,true) AS is_alive FROM characters WHERE id = $1`, [charId]);
          cccd = r.rows[0]?.cccd ?? undefined;
        }
        if (!cccd && !charId) continue;
        if (cccd && !/^\d{12}$/.test(cccd)) throw AppError.badRequest(`CCCD không hợp lệ: ${cccd}`);
        if (charId === character.id) throw AppError.badRequest('Không thể đặt chính mình làm người thừa kế.');
        if (!(h.sharePct > 0) || h.sharePct > 100) throw AppError.badRequest('Tỉ lệ thừa kế mỗi người phải > 0% và ≤ 100%.');
        if (cccd) {
          if (seen.has(cccd)) throw AppError.badRequest('Mỗi người thừa kế (CCCD) chỉ được khai báo một lần.');
          seen.add(cccd);
          const r = await client.query<{ id: string }>(`SELECT id FROM characters WHERE cccd = $1`, [cccd]);
          charId = r.rows[0]?.id ?? charId;
        }
        if (!cccd) continue;
        resolved.push({ beneficiaryCccd: cccd, beneficiaryCharacterId: charId, sharePct: h.sharePct, relationship: h.relationship, note: h.note });
      }

      const total = resolved.reduce((s, h) => s + h.sharePct, 0);
      if (resolved.length > 0 && (total <= 0 || total > 100 + 1e-6)) {
        throw AppError.badRequest('Tổng tỉ lệ thừa kế phải lớn hơn 0% và không vượt quá 100%.');
      }

      const primaryHeirId = resolved[0]?.beneficiaryCharacterId ?? null;
      const will = await this.repository.upsertWill(client, character.id, primaryHeirId, input.trustFundEnabled);
      await (this.repository as any).replaceWillBeneficiaries(client, will.id, resolved);
      // đồng bộ legacy will_heirs (nếu có character_id) để tương thích
      await this.repository.replaceWillHeirs(
        client,
        will.id,
        resolved.filter((h) => h.beneficiaryCharacterId).map((h) => ({ characterId: h.beneficiaryCharacterId as string, sharePct: h.sharePct, relationship: h.relationship, note: h.note })),
      );

      if (input.trustFundEnabled) {
        await this.repository.createTrustFund(client, character.id);
      }

      await notify(client, {
        userId,
        kind: 'social',
        title: 'Cập nhật di chúc',
        body:
          resolved.length > 0
            ? `Di chúc đã được cập nhật với ${resolved.length} người thụ hưởng (tổng ${total.toFixed(2)}%).`
            : 'Di chúc đã được cập nhật.',
        payload: { willId: will.id, heirsCount: resolved.length, totalSharePct: total, trustFundEnabled: input.trustFundEnabled },
      });

      const updated = await this.repository.getWill(character.id, client);
      const benRows = updated ? await (this.repository as any).listWillBeneficiaries(updated.id, client) : [];
      const heirsDto = benRows.map((h: any) => ({
        beneficiaryCccd: h.beneficiaryCccd,
        beneficiaryName: h.beneficiaryName ?? null,
        characterId: h.beneficiaryCharacterId ?? undefined,
        characterName: h.beneficiaryName ?? undefined,
        sharePct: Number(h.sharePct),
        relationship: h.relationship,
        note: h.note,
      }));
      const primary = heirsDto[0] as any;
      return {
        id: updated?.id ?? null,
        primaryHeirId: primary?.characterId ?? null,
        primaryHeirName: primary?.beneficiaryName ?? primary?.characterName ?? null,
        heirs: heirsDto as any,
        trustFundEnabled: updated?.trustFundEnabled ?? input.trustFundEnabled,
        updatedAt: updated?.updatedAt?.toISOString() ?? null,
      };
    });
  }

  /** Nạp tiền vào quỹ tín thác và (tuỳ chọn) cập nhật danh sách thụ hưởng theo CCCD + tỉ lệ. */
  async depositTrustFund(
    userId: string,
    amountMinor: number,
    beneficiaries?: Array<{ beneficiaryCccd: string; sharePct: number }>,
  ): Promise<SocialOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      if (amountMinor <= 0) {
        throw AppError.badRequest('Số tiền nạp quỹ tín thác phải lớn hơn 0.');
      }
      const trustFundId = await this.repository.createTrustFund(client, character.id);

      if (beneficiaries && beneficiaries.length > 0) {
        const seen = new Set<string>();
        const resolved: Array<{ beneficiaryCccd: string; beneficiaryCharacterId: string | null; sharePct: number }> = [];
        for (const b of beneficiaries) {
          const cccd = String(b.beneficiaryCccd || '').replace(/\s+/g, '');
          if (!/^\d{12}$/.test(cccd)) throw AppError.badRequest(`CCCD không hợp lệ: ${cccd}`);
          if (seen.has(cccd)) throw AppError.badRequest('Mỗi người thụ hưởng quỹ tín thác chỉ được khai báo một lần.');
          seen.add(cccd);
          if (!(b.sharePct > 0) || b.sharePct > 100) throw AppError.badRequest('Tỉ lệ thụ hưởng phải > 0% và ≤ 100%.');
          const r = await client.query<{ id: string }>(`SELECT id FROM characters WHERE cccd = $1`, [cccd]);
          resolved.push({ beneficiaryCccd: cccd, beneficiaryCharacterId: r.rows[0]?.id ?? null, sharePct: Number(b.sharePct) });
        }
        const total = resolved.reduce((s, b) => s + b.sharePct, 0);
        if (total <= 0 || total > 100 + 1e-6) throw AppError.badRequest('Tổng tỉ lệ thụ hưởng quỹ tín thác phải > 0% và ≤ 100%.');
        await (this.repository as any).replaceTrustFundBeneficiaries(client, trustFundId, resolved);
      }

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'escrow', ownerId: '00000000-0000-4000-8000-0000000000b4' },
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
        body: `Bạn đã nạp ${amountMinor.toLocaleString('vi-VN')} ₫ vào quỹ tín thác.`,
        payload: { trustFundId, amountMinor },
      });
      return this.getOverview(userId, client);
    });
  }
}

export const socialService = new SocialService();

