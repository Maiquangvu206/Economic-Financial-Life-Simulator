import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import {
  type CareersOverviewExtDto,
  type GraduationDto,
  type EarlyGraduateResultDto,
  type UnlockedFeature,
  MoneySchema,
} from '@efls/contracts';
import { educationRepository } from './education.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

const EARLY_GRAD_MIN_PROGRESS = 2 / 3; // 66.67% thời gian khóa học
const EARLY_GRAD_PASS_SCORE = 60;

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

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function degreeProgress(enrolledAt: Date, graduatesAt: Date, now = new Date()) {
  const start = enrolledAt.getTime();
  const end = graduatesAt.getTime();
  if (end <= start) return 1;
  return clamp01((now.getTime() - start) / (end - start));
}

function canEarlyGraduate(progress: number, graduatesAt: Date, now = new Date()) {
  return now < graduatesAt && progress >= EARLY_GRAD_MIN_PROGRESS;
}

function degreeDtoFromRow(d: Awaited<ReturnType<typeof educationRepository.listDegrees>>[number]) {
  const progress = d.status === 'graduated' ? 1 : degreeProgress(d.enrolledAt, d.graduatesAt);
  const progressPct = Math.round(progress * 1000) / 10;
  return {
    id: d.id,
    universityId: d.universityId,
    universityName: d.universityName,
    degreeCode: d.degreeCode,
    field: d.field ?? '',
    status: d.status as 'enrolled' | 'graduated' | 'dropped',
    enrolledAt: d.enrolledAt.toISOString(),
    graduatesAt: d.graduatesAt.toISOString(),
    progressPct,
    canEarlyGraduate: d.status === 'enrolled' ? canEarlyGraduate(progress, d.graduatesAt) : false,
    earlyGraduateMinProgressPct: Math.round(EARLY_GRAD_MIN_PROGRESS * 100),
  };
}

/** Dịch vụ giáo dục: ghi danh, tốt nghiệp (đúng hạn/sớm), mở khóa tính năng. */
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
      degrees: degrees.map(degreeDtoFromRow),
      employment: null,
      unlockedFeatures,
      tuitionPaidTotal: tuitionPaid,
    };
  }

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
        body: `Bạn đã ghi danh ${university.name}. Tốt nghiệp sau ${university.durationMonths} tháng (có thể thi tốt nghiệp sớm khi đạt ${Math.round(EARLY_GRAD_MIN_PROGRESS * 100)}% thời gian).`,
        payload: { universityId, degreeId, tuition },
      });
      return this.getOverview(userId, client);
    });
  }

  async graduate(userId: string, degreeId: string): Promise<GraduationDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const degree = await this.repository.getDegreeForCharacter(degreeId, character.id, client);
      if (!degree) throw AppError.notFound('Degree');
      if (degree.status !== 'enrolled') {
        throw AppError.badRequest('Bằng cấp này đã tốt nghiệp hoặc bị hủy.');
      }
      if (new Date() < degree.graduatesAt) {
        throw AppError.badRequest(`Chưa đến thời gian tốt nghiệp. Bạn có thể làm bài test tốt nghiệp sớm khi đạt ${Math.round(EARLY_GRAD_MIN_PROGRESS * 100)}% thời gian khóa học.`);
      }
      return this.finalizeGraduation(client, userId, character.id, degree, 'Tốt nghiệp!');
    });
  }

  /** Tốt nghiệp sớm: đạt >= 2/3 thời gian khóa học thì được làm bài test; đạt yêu cầu sẽ ra trường sớm. */
  async earlyGraduate(userId: string, degreeId: string): Promise<EarlyGraduateResultDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const degree = await this.repository.getDegreeForCharacter(degreeId, character.id, client);
      if (!degree) throw AppError.notFound('Degree');
      if (degree.status !== 'enrolled') {
        throw AppError.badRequest('Bằng cấp này đã tốt nghiệp hoặc bị hủy.');
      }
      const now = new Date();
      if (now >= degree.graduatesAt) {
        // đã đủ thời gian -> coi như tốt nghiệp thường
        const grad = await this.finalizeGraduation(client, userId, character.id, degree, 'Tốt nghiệp!');
        return { passed: true, score: 100, requiredScore: EARLY_GRAD_PASS_SCORE, message: 'Bạn đã đủ thời gian khóa học và được tốt nghiệp.', graduation: grad };
      }
      const progress = degreeProgress(degree.enrolledAt, degree.graduatesAt, now);
      if (!canEarlyGraduate(progress, degree.graduatesAt, now)) {
        const pct = Math.round(progress * 1000) / 10;
        throw AppError.badRequest(`Chưa đủ điều kiện tốt nghiệp sớm. Tiến độ hiện tại ${pct}% (cần >= ${Math.round(EARLY_GRAD_MIN_PROGRESS * 100)}% thời gian khóa học).`);
      }
      // Bài test tốt nghiệp sớm (mô phỏng): điểm dựa trên tiến độ + yếu tố ngẫu nhiên ổn định
      const base = 45 + Math.round(progress * 40); // 45..85 theo tiến độ
      const jitter = Math.floor((Math.abs(Math.sin(now.getTime() / 60000 + degree.id.length)) * 100) % 21) - 10; // -10..10
      const score = Math.max(0, Math.min(100, base + jitter));
      const passed = score >= EARLY_GRAD_PASS_SCORE;
      if (!passed) {
        await notify(client, {
          userId,
          kind: 'education',
          title: 'Thi tốt nghiệp sớm chưa đạt',
          body: `Bạn đạt ${score}/100 (cần >= ${EARLY_GRAD_PASS_SCORE}). Hãy ôn tập và thử lại sau khi tích lũy thêm thời gian học.`,
          payload: { degreeId, score, requiredScore: EARLY_GRAD_PASS_SCORE },
        });
        return {
          passed: false,
          score,
          requiredScore: EARLY_GRAD_PASS_SCORE,
          message: `Bài test tốt nghiệp sớm: ${score}/100 (cần >= ${EARLY_GRAD_PASS_SCORE}). Chưa đạt, bạn có thể thử lại sau.`,
          graduation: null,
        };
      }
      const grad = await this.finalizeGraduation(client, userId, character.id, degree, 'Tốt nghiệp sớm!');
      return {
        passed: true,
        score,
        requiredScore: EARLY_GRAD_PASS_SCORE,
        message: `Chúc mừng! Bạn đạt ${score}/100 và được tốt nghiệp sớm (${Math.round(progress * 100)}% thời gian khóa học).`,
        graduation: grad,
      };
    });
  }

  private async finalizeGraduation(
    client: Parameters<Parameters<typeof withTransaction>[0]>[0],
    userId: string,
    characterId: string,
    degree: Awaited<ReturnType<typeof educationRepository.getDegree>>,
    title: string,
  ): Promise<GraduationDto> {
    if (!degree) throw AppError.notFound('Degree');
    await this.repository.graduateDegree(client, degree.id);
    const unlockedFeatures = UNLOCK_MAP[degree.degreeCode] ?? [];
    const skillProgress = GRADUATION_SKILLS[degree.degreeCode] ?? [];
    for (const s of skillProgress) {
      await this.repository.upsertSkill(client, characterId, s.skill, s.progress);
    }

    await notify(client, {
      userId,
      kind: 'education',
      title,
      body: `Chúc mừng bạn đã tốt nghiệp ${degree.degreeCode}${degree.universityName ? ` (${degree.universityName})` : ''}. Mở khóa: ${unlockedFeatures.join(', ') || 'không có tính năng đặc biệt'}.`,
      payload: { degreeId: degree.id, degreeCode: degree.degreeCode, unlockedFeatures },
    });

    const updated = await this.repository.getDegree(degree.id, client);
    if (!updated) throw new Error('Degree disappeared during graduation');
    return {
      degree: degreeDtoFromRow(updated),
      unlockedFeatures,
      skillProgress,
    };
  }

  private collectUnlocked(degrees: Awaited<ReturnType<typeof educationRepository.listDegrees>>): UnlockedFeature[] {
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
