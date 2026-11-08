import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import {
  type CareersOverviewExtDto,
  type GraduationDto,
  type UnlockedFeature,
  MoneySchema,
} from '@efls/contracts';
import { educationRepository } from './education.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

/** Tính năng mở khóa theo từng bằng cấp (degree_code). */
const UNLOCK_MAP: Record<string, UnlockedFeature[]> = {
  BK_HUST: ['board_seat'],
  NEU: ['ipo', 'lower_audit_risk'],
  FTU: ['ipo'],
  HLU: ['self_defense', 'lower_audit_risk'],
  UMP: [],
  NLU: [],
};

/** Kỹ năng nhận được sau khi tốt nghiệp. */
const GRADUATION_SKILLS: Record<string, { skill: string; progress: number }[]> = {
  BK_HUST: [{ skill: 'technology', progress: 60 }],
  NEU: [{ skill: 'finance', progress: 60 }],
  FTU: [{ skill: 'business', progress: 60 }],
  HLU: [{ skill: 'law', progress: 60 }],
  UMP: [{ skill: 'health', progress: 60 }],
  NLU: [{ skill: 'agriculture', progress: 60 }],
};

/** Dịch vụ giáo dục: ghi danh, tốt nghiệp, mở khóa tính năng. */
export class EducationService {
  constructor(private readonly repository = educationRepository) {}

  async getOverview(
    userId: string,
    dbOverride?: Parameters<typeof this.repository.listUniversities>[0],
  ): Promise<CareersOverviewExtDto> {
    const db = dbOverride ?? this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const [universities, degrees, tuitionPaid] = await Promise.all([
      this.repository.listUniversities(db),
      this.repository.listDegrees(character.id, db),
      this.repository.totalTuitionPaid(character.id, db),
    ]);

    const enrolledIds = new Set(
      degrees.filter((d) => d.status === 'enrolled').map((d) => d.universityId),
    );
    const unlockedFeatures = this.collectUnlocked(degrees);

    return {
      jobs: [],
      universities: universities.map((u) => ({
        id: u.id,
        name: u.name,
        degreeCode: u.degreeCode,
        field: u.field as CareersOverviewExtDto['universities'][number]['field'],
        tuition: money(Number(u.tuitionMinor)),
        durationMonths: u.durationMonths,
        enrolled: enrolledIds.has(u.id),
      })),
      degrees: degrees.map((d) => ({
        id: d.id,
        degreeCode: d.degreeCode,
        field: '',
        status: d.status as 'enrolled' | 'graduated' | 'dropped',
        enrolledAt: d.enrolledAt.toISOString(),
        graduatesAt: d.graduatesAt.toISOString(),
      })),
      employment: null,
      unlockedFeatures,
      tuitionPaidTotal: tuitionPaid,
    };
  }

  /** Ghi danh đại học: trừ học phí qua ledger, tạo bằng chờ tốt nghiệp. */
  async enroll(userId: string, universityId: string): Promise<CareersOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const university = await this.repository.getUniversity(universityId, client);
      if (!university) throw AppError.notFound('University');

      const existing = await this.repository.listDegrees(character.id, client);
      if (existing.some((d) => d.universityId === universityId && d.status === 'enrolled')) {
        throw AppError.conflict('already_enrolled', 'Bạn đã ghi danh trường này.');
      }

      const tuition = Number(university.tuitionMinor);
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < tuition) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền đóng học phí.');
      }

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
        amountMinor: tuition,
        kind: 'tuition_payment',
        description: `Học phí ${university.name}`,
        referenceType: 'university',
        referenceId: universityId,
      });

      const degreeId = await this.repository.createDegree(client, character.id, university);
      await this.repository.recordTuition(client, character.id, universityId, degreeId, tuition);

      await notify(client, {
        userId,
        kind: 'education',
        title: 'Ghi danh thành công',
        body: `Bạn đã ghi danh ${university.name}. Tốt nghiệp sau ${university.durationMonths} tháng.`,
        payload: { universityId, degreeId, tuition },
      });
      return this.getOverview(userId, client);
    });
  }

  /**
   * Tốt nghiệp: chỉ khi đã qua graduatesAt. Mở khóa tính năng
   * theo bảng UNLOCK_MAP và cộng kỹ năng.
   */
  async graduate(userId: string, degreeId: string): Promise<GraduationDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const degree = await this.repository.getDegree(degreeId, client);
      if (!degree) throw AppError.notFound('Degree');
      if (degree.status !== 'enrolled') {
        throw AppError.badRequest('Bằng cấp này đã tốt nghiệp hoặc bị hủy.');
      }
      if (new Date() < degree.graduatesAt) {
        throw AppError.badRequest('Chưa đến thời gian tốt nghiệp.');
      }

      await this.repository.graduateDegree(client, degreeId);
      const unlockedFeatures = UNLOCK_MAP[degree.degreeCode] ?? [];
      const skillProgress = GRADUATION_SKILLS[degree.degreeCode] ?? [];
      for (const s of skillProgress) {
        await this.repository.upsertSkill(client, character.id, s.skill, s.progress);
      }

      await notify(client, {
        userId,
        kind: 'education',
        title: 'Tốt nghiệp!',
        body: `Chúc mừng bạn đã tốt nghiệp ${degree.degreeCode}. Mở khóa: ${unlockedFeatures.join(', ') || 'không có tính năng đặc biệt'}.`,
        payload: { degreeId, degreeCode: degree.degreeCode, unlockedFeatures },
      });

      const updated = await this.repository.getDegree(degreeId, client);
      if (!updated) throw new Error('Degree disappeared during graduation');
      return {
        degree: {
          id: updated.id,
          degreeCode: updated.degreeCode,
          field: '',
          status: 'graduated',
          enrolledAt: updated.enrolledAt.toISOString(),
          graduatesAt: updated.graduatesAt.toISOString(),
        },
        unlockedFeatures,
        skillProgress,
      };
    });
  }

  private collectUnlocked(
    degrees: Awaited<ReturnType<typeof educationRepository.listDegrees>>,
  ): UnlockedFeature[] {
    const unlocked = new Set<UnlockedFeature>();
    for (const d of degrees) {
      if (d.status === 'graduated') {
        for (const f of UNLOCK_MAP[d.degreeCode] ?? []) unlocked.add(f);
      }
    }
    return [...unlocked];
  }
}

export const educationService = new EducationService();
