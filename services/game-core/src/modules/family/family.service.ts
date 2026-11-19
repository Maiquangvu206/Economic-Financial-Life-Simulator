import { AppError } from '../../shared/http/errors.js';
import { withTransaction, type Db } from '../../shared/db/tx.js';
import { requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { notify } from '../notifications/notification.service.js';
import { pool } from '../../shared/db/pool.js';
import { generateCccd } from '@efls/domain';
import { generateAccountNumber } from '../../shared/banking/accountTier.js';
import type {
  FamilyOverviewDto,
  ChildDto,
  PregnancyDto,
  BirthProposalDto,
  AdoptionApplicationDto,
  AdoptableChildDto,
  CareTier,
} from '@efls/contracts';
import { familyRepository, type ChildRow, type PregnancyRow, type BirthProposalRow, type AdoptionApplicationRow, type AdoptableChildRow } from './family.repository.js';

const DAYS_PER_YEAR = 360;
const DAYS_PER_MONTH = 30;
const PREGNANCY_DAYS = 300; // 10 tháng game
const ADOPTION_REVIEW_DAYS = 30;
const BIRTH_COOLDOWN_DAYS = 360; // 1 năm game
const CARE_COST_PER_DAY: Record<CareTier, number> = {
  economy: 50_000,
  standard: 150_000,
  premium: 400_000,
};

function absDay(year: number, dayOfYear: number): number {
  return Math.floor(year) * DAYS_PER_YEAR + ((Math.floor(dayOfYear) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
}

function fromAbsDay(abs: number): { year: number; day: number } {
  const year = Math.floor(abs / DAYS_PER_YEAR);
  const day = ((abs % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return { year, day };
}

function addGameDays(year: number, dayOfYear: number, deltaDays: number): { year: number; day: number } {
  return fromAbsDay(absDay(year, dayOfYear) + deltaDays);
}

function money(amount: number) {
  return { amount: Math.max(0, Math.round(amount)), currency: 'VND' as const };
}

function isAdultAge(age: number): boolean {
  return Number(age) >= 20;
}

async function getCharacterState(db: Db, characterId: string): Promise<{
  id: string; user_id: string | null; full_name: string; age: number; health_energy: number;
  is_alive: boolean; marital_status: string; spouse_id: string | null; birthplace: string | null;
  last_birth_game_year: number | null; last_birth_game_day: number | null;
} | null> {
  const r = await db.query<any>(
    `SELECT id, user_id, full_name, age, health_energy, COALESCE(is_alive,true) AS is_alive,
            marital_status, spouse_id, birthplace, last_birth_game_year, last_birth_game_day
     FROM characters WHERE id = $1`,
    [characterId],
  );
  return r.rows[0] ?? null;
}

async function getActiveMarriage(db: Db, characterId: string): Promise<{ id: string; spouseId: string } | null> {
  const r = await db.query<{ id: string; spouse_id: string; character_id: string }>(
    `SELECT id, character_id, spouse_id FROM marriage_contracts
     WHERE status = 'active' AND (character_id = $1 OR spouse_id = $1)
     ORDER BY married_at DESC LIMIT 1`,
    [characterId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const spouseId = row.character_id === characterId ? row.spouse_id : row.character_id;
  return spouseId ? { id: row.id, spouseId } : null;
}

async function ensureUniqueCccd(client: Db, birthplace: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const candidate = generateCccd(birthplace || '001');
    const exists = await client.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM characters WHERE cccd = $1) AS exists`, [candidate]);
    if (!exists.rows[0]?.exists) return candidate;
  }
  // fallback deterministic-ish
  for (let i = 0; i < 200; i++) {
    const candidate = `${(birthplace || '001').padStart(3, '0').slice(0,3)}${String(Date.now()+i).slice(-9).padStart(9,'0')}`.slice(0,12);
    const exists = await client.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM characters WHERE cccd = $1) AS exists`, [candidate]);
    if (!exists.rows[0]?.exists) return candidate;
  }
  throw AppError.conflict('cccd_exhausted', 'Không thể tạo CCCD duy nhất cho nhân vật phụ thuộc.');
}

async function ensureUniqueAccountNumber(client: Db): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const candidate = generateAccountNumber();
    const exists = await client.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM characters WHERE account_number = $1) AS exists`, [candidate]);
    if (!exists.rows[0]?.exists) return candidate;
  }
  for (let i = 0; i < 200; i++) {
    const candidate = `9${String(Date.now()+i).slice(-11).padStart(11,'0')}`.slice(0,12);
    const exists = await client.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM characters WHERE account_number = $1) AS exists`, [candidate]);
    if (!exists.rows[0]?.exists) return candidate;
  }
  throw AppError.conflict('account_number_exhausted', 'Không thể tạo số tài khoản duy nhất cho nhân vật phụ thuộc.');
}

function childDto(row: ChildRow, viewerId: string): ChildDto {
  const isCustodian = row.custodial_parent_id === viewerId;
  const isParent = row.parent_1_id === viewerId || row.parent_2_id === viewerId;
  const canManage = (isCustodian || (isParent && !row.custodial_parent_id)) && row.is_dependent && row.dependent_status !== 'lost_custody';
  const adult = Number(row.age) >= 18 || row.dependent_status === 'adult';
  return {
    id: row.id,
    fullName: row.full_name,
    age: Number(row.age),
    isAdopted: !!row.is_adopted,
    isDependent: !!row.is_dependent,
    dependentStatus: (row.dependent_status as any) ?? 'none',
    wellbeing: row.wellbeing == null ? null : Number(row.wellbeing),
    careTier: (row.care_tier as CareTier | null) ?? null,
    careDebt: money(Number(row.care_debt_minor ?? 0)),
    unpaidCareDays: Number(row.unpaid_care_days ?? 0),
    parent1Id: row.parent_1_id,
    parent1Name: row.parent_1_name,
    parent2Id: row.parent_2_id,
    parent2Name: row.parent_2_name,
    custodialParentId: row.custodial_parent_id,
    custodialParentName: row.custodial_parent_name,
    childSupportPercent: Number(row.child_support_percent ?? 0),
    childSupportPayerId: row.child_support_payer_id,
    childSupportPayerName: row.child_support_payer_name,
    canChangeCareTier: canManage && !adult,
    canInteract: canManage && !adult,
    canStudy: canManage && !adult && Number(row.age) >= 6,
    canMedicalCheckup: canManage && !adult,
  };
}

function pregnancyDto(row: PregnancyRow): PregnancyDto {
  return {
    id: row.id,
    motherCharacterId: row.pregnant_character_id,
    motherName: row.pregnant_name,
    fatherCharacterId: row.other_parent_character_id,
    fatherName: row.other_parent_name,
    status: row.status as any,
    startGameYear: row.start_game_year,
    startGameDay: row.start_game_day,
    dueGameYear: row.due_game_year,
    dueGameDay: row.due_game_day,
    healthWarningDays: row.health_warning_days,
    childId: row.child_character_id,
    miscarriageReason: row.miscarriage_reason,
    createdAt: row.created_at.toISOString(),
  };
}

function birthProposalDto(row: BirthProposalRow): BirthProposalDto {
  return {
    id: row.id,
    proposerCharacterId: row.proposer_character_id,
    proposerName: row.proposer_name,
    partnerCharacterId: row.partner_character_id,
    partnerName: row.partner_name,
    status: row.status as any,
    createdAt: row.created_at.toISOString(),
    respondedAt: row.responded_at ? row.responded_at.toISOString() : null,
  };
}

function adoptionApplicationDto(row: AdoptionApplicationRow): AdoptionApplicationDto {
  return {
    id: row.id,
    applicantCharacterId: row.applicant_character_id,
    applicantName: row.applicant_name,
    spouseCharacterId: row.spouse_character_id,
    spouseName: row.spouse_name,
    childId: row.child_character_id,
    childName: row.child_name,
    status: row.status as any,
    appliedGameYear: row.applied_game_year,
    appliedGameDay: row.applied_game_day,
    reviewCompleteGameYear: row.review_complete_game_year,
    reviewCompleteGameDay: row.review_complete_game_day,
    spouseApproved: row.spouse_approved,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

function adoptableChildDto(row: AdoptableChildRow): AdoptableChildDto {
  return { id: row.id, fullName: row.full_name, age: row.age, wellbeing: row.wellbeing == null ? null : Number(row.wellbeing) };
}

export class FamilyService {
  constructor(private readonly repository = familyRepository) {}

  private async ensureAdoptablePool(client: Db, gs: { current_year: number; current_day: number }): Promise<void> {
    const existing = await this.repository.listAdoptableChildren(client);
    if (existing.length >= 5) return;
    const need = 5 - existing.length;
    const firstNames = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hùng', 'Khánh', 'Linh', 'Minh', 'My', 'Nam', 'Ngọc', 'Phúc', 'Quân', 'Trang', 'Tuấn', 'Vy'];
    const lastNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ'];
    for (let i = 0; i < need; i++) {
      const age = 1 + Math.floor(Math.random() * 12); // 1-12
      const birth = addGameDays(gs.current_year, gs.current_day, -(age * DAYS_PER_YEAR + Math.floor(Math.random() * 300)));
      const fullName = `${lastNames[(Date.now() + i) % lastNames.length]} ${firstNames[(Date.now() * 3 + i * 7) % firstNames.length]}`;
      const birthplace = '001';
      const cccd = await ensureUniqueCccd(client, birthplace);
      const accountNumber = await ensureUniqueAccountNumber(client);
      await this.repository.createNpcAdoptableChild(client as any, {
        fullName,
        age,
        wellbeing: 60 + Math.floor(Math.random() * 31),
        birthplace,
        cccd,
        accountNumber,
        birthGameYear: birth.year,
        birthGameDay: birth.day,
      });
    }
  }

  async getOverview(userId: string): Promise<FamilyOverviewDto> {
    const db = this.repository.db;
    const me = await requireLivingCharacterByUserId(db, userId);
    const gs = await this.repository.getGameState(db);
    await this.ensureAdoptablePool(db, gs).catch(() => {});

    const [children, pregnancies, birthProposals, adoptionApplications, adoptableChildren] = await Promise.all([
      this.repository.listChildrenForCharacter(me.id, db),
      this.repository.listActivePregnanciesForCharacter(me.id, db),
      this.repository.listBirthProposalsForCharacter(me.id, db),
      this.repository.listAdoptionApplicationsForCharacter(me.id, db),
      this.repository.listAdoptableChildren(db),
    ]);

    const marriage = await getActiveMarriage(db, me.id);
    const myState = await getCharacterState(db, me.id);
    let canProposeBirth = false;
    let birthBlockedReason: string | null = null;
    if (!marriage) {
      birthBlockedReason = 'Bạn cần kết hôn (active) để sinh con.';
    } else if (!myState || !isAdultAge(myState.age) || myState.health_energy < 80) {
      birthBlockedReason = 'Bạn cần đủ 20 tuổi game và health_energy >= 80.';
    } else {
      const spouseState = await getCharacterState(db, marriage.spouseId);
      if (!spouseState || !isAdultAge(spouseState.age) || spouseState.health_energy < 80) {
        birthBlockedReason = 'Vợ/chồng cần đủ 20 tuổi game và health_energy >= 80.';
      } else {
        const [hasResidenceMe, hasResidenceSpouse] = await Promise.all([
          this.repository.hasValidResidence(me.id, db),
          this.repository.hasValidResidence(marriage.spouseId, db),
        ]);
        if (!hasResidenceMe && !hasResidenceSpouse) {
          birthBlockedReason = 'Cần có sở hữu hoặc thuê nhà ở hợp lệ.';
        } else {
          const nowAbs = absDay(gs.current_year, gs.current_day);
          const aLast = await this.repository.getLastBirthInfo(me.id, db);
          const bLast = await this.repository.getLastBirthInfo(marriage.spouseId, db);
          const lastA = aLast.last_birth_game_year != null && aLast.last_birth_game_day != null ? absDay(aLast.last_birth_game_year, aLast.last_birth_game_day) : null;
          const lastB = bLast.last_birth_game_year != null && bLast.last_birth_game_day != null ? absDay(bLast.last_birth_game_year, bLast.last_birth_game_day) : null;
          const tooSoon = (lastA != null && nowAbs - lastA < BIRTH_COOLDOWN_DAYS) || (lastB != null && nowAbs - lastB < BIRTH_COOLDOWN_DAYS);
          if (tooSoon) birthBlockedReason = 'Chưa đủ 1 năm game kể từ lần sinh con gần nhất.';
          else if (await this.repository.hasActivePregnancyForCouple(me.id, marriage.spouseId, db)) birthBlockedReason = 'Hai vợ chồng đang có thai kỳ đang hoạt động.';
          else canProposeBirth = true;
        }
      }
    }

    let canApplyAdoption = false;
    let adoptionBlockedReason: string | null = null;
    if (!myState || !isAdultAge(myState.age)) adoptionBlockedReason = 'Bạn cần đủ 20 tuổi game để nhận con nuôi.';
    else {
      const hasResidence = await this.repository.hasValidResidence(me.id, db);
      const spouseResidence = marriage ? await this.repository.hasValidResidence(marriage.spouseId, db) : false;
      if (!hasResidence && !spouseResidence) adoptionBlockedReason = 'Cần có sở hữu hoặc thuê nhà ở hợp lệ.';
      else canApplyAdoption = true;
    }

    return {
      children: children.map((c) => childDto(c, me.id)),
      pregnancies: pregnancies.map(pregnancyDto),
      birthProposals: birthProposals.map(birthProposalDto),
      adoptionApplications: adoptionApplications.map(adoptionApplicationDto),
      adoptableChildren: adoptableChildren.map(adoptableChildDto),
      canProposeBirth,
      canApplyAdoption,
      birthBlockedReason,
      adoptionBlockedReason,
    };
  }

  async proposeBirth(userId: string): Promise<FamilyOverviewDto> {
    return withTransaction(async (client) => {
      const me = await requireLivingCharacterByUserId(client, userId);
      const gs = await this.repository.getGameState(client);
      const marriage = await getActiveMarriage(client, me.id);
      if (!marriage) throw AppError.badRequest('Bạn cần đang kết hôn (active) để đề xuất sinh con.');

      const spouse = await getCharacterState(client, marriage.spouseId);
      const meState = await getCharacterState(client, me.id);
      if (!spouse || spouse.is_alive === false) throw AppError.badRequest('Vợ/chồng không hợp lệ hoặc không còn hoạt động.');
      if (!meState || !isAdultAge(meState.age) || !isAdultAge(spouse.age)) throw AppError.badRequest('Cả hai vợ chồng phải đủ 20 tuổi game.');
      if (meState.health_energy < 80 || spouse.health_energy < 80) throw AppError.badRequest('Cả hai vợ chồng phải có health_energy >= 80.');

      const [resA, resB] = await Promise.all([
        this.repository.hasValidResidence(me.id, client),
        this.repository.hasValidResidence(spouse.id, client),
      ]);
      if (!resA && !resB) throw AppError.badRequest('Hai vợ chồng cần có sở hữu hoặc thuê nhà ở hợp lệ.');

      const nowAbs = absDay(gs.current_year, gs.current_day);
      for (const id of [me.id, spouse.id]) {
        const last = await this.repository.getLastBirthInfo(id, client);
        if (last.last_birth_game_year != null && last.last_birth_game_day != null) {
          const lastAbs = absDay(last.last_birth_game_year, last.last_birth_game_day);
          if (nowAbs - lastAbs < BIRTH_COOLDOWN_DAYS) {
            throw AppError.badRequest('Không thể sinh con trong vòng 1 năm game kể từ lần sinh con gần nhất.');
          }
        }
      }

      if (await this.repository.hasActivePregnancyForCouple(me.id, spouse.id, client)) {
        throw AppError.conflict('pregnancy_active', 'Hai vợ chồng đang có thai kỳ đang hoạt động.');
      }
      const pending = await this.repository.getPendingBirthProposalBetween(me.id, spouse.id, client);
      if (pending) throw AppError.conflict('birth_proposal_pending', 'Đã có đề xuất sinh con đang chờ phản hồi.');

      const proposalId = await this.repository.createBirthProposal(client, me.id, spouse.id);
      if (spouse.user_id) {
        await notify(client, {
          userId: spouse.user_id,
          kind: 'social',
          title: 'Đề xuất sinh con',
          body: `${me.full_name} muốn sinh con cùng bạn. Vui lòng xác nhận để bắt đầu thai kỳ.`,
          payload: { proposalId, fromCharacterId: me.id },
        });
      }
      await notify(client, { userId, kind: 'social', title: 'Đã gửi đề xuất sinh con', body: 'Đề xuất sinh con đã được gửi và đang chờ vợ/chồng xác nhận.', payload: { proposalId } });
      return this.getOverview(userId);
    });
  }

  async respondBirthProposal(userId: string, proposalId: string, accept: boolean): Promise<FamilyOverviewDto> {
    return withTransaction(async (client) => {
      const me = await requireLivingCharacterByUserId(client, userId);
      const gs = await this.repository.getGameState(client);
      const proposal = await this.repository.getBirthProposal(proposalId, client);
      if (!proposal) throw AppError.notFound('Birth proposal');
      if (proposal.status !== 'pending') throw AppError.badRequest('Đề xuất sinh con không còn chờ phản hồi.');
      if (proposal.partner_character_id !== me.id) throw AppError.forbidden('Chỉ vợ/chồng được đề xuất mới có thể phản hồi.');

      if (!accept) {
        await this.repository.setBirthProposalStatus(client, proposalId, 'rejected');
        const proposerUser = await client.query<{ user_id: string | null }>(`SELECT user_id FROM characters WHERE id = $1`, [proposal.proposer_character_id]);
        const uid = proposerUser.rows[0]?.user_id;
        if (uid) await notify(client, { userId: uid, kind: 'social', title: 'Đề xuất sinh con bị từ chối', body: `${proposal.partner_name} đã từ chối đề xuất sinh con.`, payload: { proposalId } });
        return this.getOverview(userId);
      }

      // re-validate conditions at acceptance time
      const marriage = await getActiveMarriage(client, me.id);
      if (!marriage || marriage.spouseId !== proposal.proposer_character_id) {
        await this.repository.setBirthProposalStatus(client, proposalId, 'cancelled');
        throw AppError.badRequest('Hai người hiện không còn trong hôn nhân active với nhau.');
      }
      const a = await getCharacterState(client, me.id);
      const b = await getCharacterState(client, proposal.proposer_character_id);
      if (!a || !b) throw AppError.notFound('Character');
      if (!isAdultAge(a.age) || !isAdultAge(b.age)) throw AppError.badRequest('Cả hai vợ chồng phải đủ 20 tuổi game.');
      if (a.health_energy < 80 || b.health_energy < 80) throw AppError.badRequest('Cả hai vợ chồng phải có health_energy >= 80.');
      const [resA, resB] = await Promise.all([this.repository.hasValidResidence(a.id, client), this.repository.hasValidResidence(b.id, client)]);
      if (!resA && !resB) throw AppError.badRequest('Cần có sở hữu hoặc thuê nhà ở hợp lệ.');
      const nowAbs = absDay(gs.current_year, gs.current_day);
      for (const st of [a, b]) {
        if (st.last_birth_game_year != null && st.last_birth_game_day != null) {
          if (nowAbs - absDay(st.last_birth_game_year, st.last_birth_game_day) < BIRTH_COOLDOWN_DAYS) {
            throw AppError.badRequest('Không thể sinh con trong vòng 1 năm game kể từ lần sinh con gần nhất.');
          }
        }
      }
      if (await this.repository.hasActivePregnancyForCouple(a.id, b.id, client)) {
        await this.repository.setBirthProposalStatus(client, proposalId, 'cancelled');
        throw AppError.conflict('pregnancy_active', 'Hai vợ chồng đã có thai kỳ đang hoạt động.');
      }

      // Choose pregnant character deterministically (who accepted becomes pregnant carrier in this flow)
      const pregnantId = me.id;
      const otherParentId = proposal.proposer_character_id;
      const start = { year: gs.current_year, day: gs.current_day };
      const due = addGameDays(start.year, start.day, PREGNANCY_DAYS);
      const pregnancyId = await this.repository.createPregnancy(client, {
        pregnantId,
        otherParentId,
        proposerId: proposal.proposer_character_id,
        partnerId: proposal.partner_character_id,
        startYear: start.year,
        startDay: start.day,
        dueYear: due.year,
        dueDay: due.day,
      });
      await this.repository.markParentsLastBirth(client, a.id, b.id, start.year, start.day);
      await this.repository.setBirthProposalStatus(client, proposalId, 'accepted');

      for (const st of [a, b]) {
        if (st.user_id) {
          await notify(client, {
            userId: st.user_id,
            kind: 'social',
            title: 'Bắt đầu thai kỳ',
            body: `Thai kỳ đã được khởi tạo (10 tháng game). Dự kiến sinh vào ngày game ${due.day + 1}/năm ${due.year}.`,
            payload: { pregnancyId, pregnantCharacterId: pregnantId, dueGameYear: due.year, dueGameDay: due.day },
          });
        }
      }
      return this.getOverview(userId);
    });
  }

  async applyAdoption(userId: string, childId: string): Promise<FamilyOverviewDto> {
    return withTransaction(async (client) => {
      const me = await requireLivingCharacterByUserId(client, userId);
      const gs = await this.repository.getGameState(client);
      const meState = await getCharacterState(client, me.id);
      if (!meState || !isAdultAge(meState.age)) throw AppError.badRequest('Bạn cần đủ 20 tuổi game để nhận con nuôi.');

      const child = await client.query<any>(
        `SELECT id, full_name, age, parent_1_id, parent_2_id, custodial_parent_id, COALESCE(is_dependent,false) AS is_dependent, COALESCE(is_alive,true) AS is_alive, dependent_status
         FROM characters WHERE id = $1 FOR UPDATE`,
        [childId],
      );
      const ch = child.rows[0];
      if (!ch || !ch.is_dependent || ch.is_alive === false) throw AppError.notFound('Không tìm thấy trẻ phù hợp để nhận nuôi.');
      if (ch.parent_1_id || ch.parent_2_id || ch.custodial_parent_id) throw AppError.badRequest('Trẻ này không còn trong danh sách nhận nuôi.');
      if (Number(ch.age) >= 18 || ch.dependent_status === 'adult' || ch.dependent_status === 'lost_custody') throw AppError.badRequest('Trẻ này không đủ điều kiện nhận nuôi.');
      if (await this.repository.hasPendingAdoptionForChild(childId, client)) throw AppError.conflict('adoption_exists', 'Trẻ này đã có hồ sơ nhận nuôi.');

      const marriage = await getActiveMarriage(client, me.id);
      const spouseId = marriage?.spouseId ?? null;
      if (spouseId) {
        const spouse = await getCharacterState(client, spouseId);
        if (!spouse || !isAdultAge(spouse.age)) throw AppError.badRequest('Vợ/chồng cần đủ 20 tuổi game để nhận con nuôi.');
      }

      const hasResidenceMe = await this.repository.hasValidResidence(me.id, client);
      const hasResidenceSpouse = spouseId ? await this.repository.hasValidResidence(spouseId, client) : false;
      if (!hasResidenceMe && !hasResidenceSpouse) throw AppError.badRequest('Cần có sở hữu hoặc thuê nhà ở hợp lệ để nhận con nuôi.');

      const applied = { year: gs.current_year, day: gs.current_day };
      let status: string;
      let spouseApproved: boolean | null;
      let reviewStartYear = applied.year;
      let reviewStartDay = applied.day;
      if (spouseId) {
        status = 'pending_spouse_approval';
        spouseApproved = null;
        // timer starts when spouse approves; store preliminary complete as 30d from apply (will reset on approve)
        const complete = addGameDays(applied.year, applied.day, ADOPTION_REVIEW_DAYS);
        reviewStartYear = complete.year; reviewStartDay = complete.day; // placeholder, overwritten on approve
      } else {
        status = 'pending_review';
        spouseApproved = true;
        const complete = addGameDays(applied.year, applied.day, ADOPTION_REVIEW_DAYS);
        reviewStartYear = complete.year; reviewStartDay = complete.day;
      }

      const complete = spouseId
        ? addGameDays(applied.year, applied.day, ADOPTION_REVIEW_DAYS) // placeholder
        : addGameDays(applied.year, applied.day, ADOPTION_REVIEW_DAYS);
      const applicationId = await this.repository.createAdoptionApplication(client, {
        applicantId: me.id,
        spouseId,
        childId,
        status,
        appliedYear: applied.year,
        appliedDay: applied.day,
        completeYear: complete.year,
        completeDay: complete.day,
        spouseApproved,
      });

      if (spouseId) {
        const spouseState = await getCharacterState(client, spouseId);
        if (spouseState?.user_id) {
          await notify(client, {
            userId: spouseState.user_id,
            kind: 'social',
            title: 'Yêu cầu đồng thuận nhận con nuôi',
            body: `${me.full_name} đã nộp hồ sơ nhận nuôi ${ch.full_name}. Bạn cần xác nhận đồng thuận để hồ sơ được xét duyệt.`,
            payload: { applicationId, childId },
          });
        }
        await notify(client, { userId, kind: 'social', title: 'Đã nộp hồ sơ nhận con nuôi', body: `Hồ sơ nhận nuôi ${ch.full_name} đang chờ vợ/chồng đồng thuận.`, payload: { applicationId } });
      } else {
        await notify(client, { userId, kind: 'social', title: 'Đã nộp hồ sơ nhận con nuôi', body: `Hồ sơ nhận nuôi ${ch.full_name} đang chờ xét duyệt 30 ngày game.`, payload: { applicationId, childId } });
      }

      return this.getOverview(userId);
    });
  }

  async respondAdoption(userId: string, applicationId: string, accept: boolean): Promise<FamilyOverviewDto> {
    return withTransaction(async (client) => {
      const me = await requireLivingCharacterByUserId(client, userId);
      const gs = await this.repository.getGameState(client);
      const appRow = await this.repository.getAdoptionApplication(applicationId, client);
      if (!appRow) throw AppError.notFound('Adoption application');
      if (appRow.status !== 'pending_spouse_approval') throw AppError.badRequest('Hồ sơ nhận nuôi không ở trạng thái chờ vợ/chồng đồng thuận.');
      if (appRow.spouse_character_id !== me.id) throw AppError.forbidden('Chỉ vợ/chồng mới có thể xác nhận đồng thuận nhận con nuôi.');

      if (!accept) {
        await this.repository.setAdoptionStatus(client, applicationId, 'rejected', { spouseApproved: false });
        const applicant = await getCharacterState(client, appRow.applicant_character_id);
        if (applicant?.user_id) {
          await notify(client, { userId: applicant.user_id, kind: 'social', title: 'Hồ sơ nhận nuôi bị từ chối', body: `${me.full_name} không đồng thuận nhận nuôi ${appRow.child_name}.`, payload: { applicationId } });
        }
        return this.getOverview(userId);
      }

      const complete = addGameDays(gs.current_year, gs.current_day, ADOPTION_REVIEW_DAYS);
      await client.query(
        `UPDATE adoption_applications
         SET status = 'pending_review', spouse_approved = true,
             review_complete_game_year = $2, review_complete_game_day = $3, updated_at = now()
         WHERE id = $1`,
        [applicationId, complete.year, complete.day],
      );
      const applicant = await getCharacterState(client, appRow.applicant_character_id);
      if (applicant?.user_id) {
        await notify(client, { userId: applicant.user_id, kind: 'social', title: 'Hồ sơ nhận nuôi được duyệt chờ xét', body: `${me.full_name} đã đồng thuận. Hồ sơ nhận nuôi ${appRow.child_name} sẽ được xét duyệt trong 30 ngày game.`, payload: { applicationId } });
      }
      return this.getOverview(userId);
    });
  }

  async setCareTier(userId: string, childId: string, careTier: CareTier): Promise<FamilyOverviewDto> {
    return withTransaction(async (client) => {
      const me = await requireLivingCharacterByUserId(client, userId);
      const child = await this.repository.getChildForParent(childId, me.id, client);
      if (!child) throw AppError.notFound('Child');
      const allowed = (child.custodial_parent_id === me.id) || ((child.parent_1_id === me.id || child.parent_2_id === me.id) && !child.custodial_parent_id);
      if (!allowed) throw AppError.forbidden('Bạn không có quyền thay đổi bậc chăm sóc của trẻ này.');
      if (!child.is_dependent || child.dependent_status === 'lost_custody' || child.dependent_status === 'adult' || child.age >= 18) {
        throw AppError.badRequest('Không thể thay đổi bậc chăm sóc cho trẻ ở trạng thái hiện tại.');
      }
      await client.query(`UPDATE characters SET care_tier = $2, updated_at = now() WHERE id = $1`, [childId, careTier]);
      return this.getOverview(userId);
    });
  }

  async doChildAction(userId: string, childId: string, action: string, amountMinor?: number): Promise<FamilyOverviewDto> {
    return withTransaction(async (client) => {
      const me = await requireLivingCharacterByUserId(client, userId);
      const child = await this.repository.getChildForParent(childId, me.id, client);
      if (!child) throw AppError.notFound('Child');
      const allowed = (child.custodial_parent_id === me.id) || ((child.parent_1_id === me.id || child.parent_2_id === me.id) && !child.custodial_parent_id);
      if (!allowed) throw AppError.forbidden('Bạn không có quyền chăm sóc trẻ này.');
      if (!child.is_dependent || child.dependent_status === 'lost_custody') throw AppError.badRequest('Trẻ không ở trạng thái được nuôi dưỡng.');
      if (child.dependent_status === 'adult' || child.age >= 18) throw AppError.badRequest('Trẻ đã trưởng thành.');

      if (action === 'interact') {
        await client.query(`UPDATE characters SET wellbeing = LEAST(100, COALESCE(wellbeing,50) + 3), updated_at = now() WHERE id = $1`, [childId]);
      } else if (action === 'study') {
        if (child.age < 6) throw AppError.badRequest('Trẻ cần đủ 6 tuổi để đi học.');
        await client.query(`UPDATE characters SET wellbeing = LEAST(100, COALESCE(wellbeing,50) + 2), updated_at = now() WHERE id = $1`, [childId]);
      } else if (action === 'medical_checkup') {
        // simple care action; cost could be modeled, but spec lists it as support action
        await client.query(`UPDATE characters SET wellbeing = LEAST(100, COALESCE(wellbeing,50) + 5), updated_at = now() WHERE id = $1`, [childId]);
      } else if (action === 'extra_support') {
        const amt = Math.max(0, Math.round(amountMinor ?? 0));
        if (amt <= 0) throw AppError.badRequest('Số tiền chu cấp thêm phải lớn hơn 0.');
        const cashRes = await client.query<{ cash_minor: string }>(`SELECT cash_minor FROM characters WHERE id = $1 FOR UPDATE`, [me.id]);
        const cash = Number(cashRes.rows[0]?.cash_minor ?? 0);
        if (cash < amt) throw AppError.conflict('insufficient_funds', 'Không đủ tiền để chu cấp thêm.');
        await client.query(`UPDATE characters SET cash_minor = cash_minor - $2, updated_at = now() WHERE id = $1`, [me.id, amt]);
        // extra support can reduce care debt and improve wellbeing
        const debtRes = await client.query<{ care_debt_minor: string }>(`SELECT COALESCE(care_debt_minor,0)::text AS care_debt_minor FROM characters WHERE id = $1`, [childId]);
        const debt = Number(debtRes.rows[0]?.care_debt_minor ?? 0);
        const payDebt = Math.min(debt, amt);
        const newDebt = debt - payDebt;
        await client.query(
          `UPDATE characters SET care_debt_minor = $2::bigint, wellbeing = LEAST(100, COALESCE(wellbeing,50) + 4), updated_at = now() WHERE id = $1`,
          [childId, newDebt],
        );
      } else {
        throw AppError.badRequest('Hành động chăm sóc không hợp lệ.');
      }

      return this.getOverview(userId);
    });
  }
}

export const familyService = new FamilyService();
