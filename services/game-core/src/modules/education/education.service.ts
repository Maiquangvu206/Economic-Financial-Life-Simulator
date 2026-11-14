import crypto from 'node:crypto';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import { callAiService } from '../../shared/ai/aiClient.js';
import {
  type CareersOverviewExtDto,
  type GraduationDto,
  type EarlyGraduateResultDto,
  type EarlyGraduateStartResponse,
  type UnlockedFeature,
  MoneySchema,
} from '@efls/contracts';
import { educationRepository } from './education.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

const EARLY_GRAD_MIN_PROGRESS = 2 / 3; // 66.67% thời gian khóa học
const EARLY_GRAD_PASS_SCORE = 60; // % (>= 3/5 câu)

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
        tuition: money(Number(u.tuitionMinor)), // học phí theo tháng
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

      const monthlyTuition = Number(university.tuitionMinor);
      const totalTuition = monthlyTuition * Number(university.durationMonths);
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < totalTuition) {
        throw AppError.conflict('insufficient_funds', `Không đủ tiền đóng học phí. Cần ${totalTuition.toLocaleString('vi-VN')} ₫ (học phí ${monthlyTuition.toLocaleString('vi-VN')} ₫/tháng × ${university.durationMonths} tháng), hiện có ${balance.toLocaleString('vi-VN')} ₫.`);
      }

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
        amountMinor: totalTuition,
        kind: 'tuition_payment',
        description: `Học phí ${university.name} (${monthlyTuition.toLocaleString('vi-VN')} ₫/tháng × ${university.durationMonths} tháng)`,
        referenceType: 'university',
        referenceId: universityId,
      });

      const degreeId = await this.repository.createDegree(client, character.id, university);
      await this.repository.recordTuition(client, character.id, universityId, degreeId, totalTuition);

      await notify(client, {
        userId,
        kind: 'education',
        title: 'Ghi danh thành công',
        body: `Bạn đã ghi danh ${university.name}. Học phí ${monthlyTuition.toLocaleString('vi-VN')} ₫/tháng × ${university.durationMonths} tháng = ${totalTuition.toLocaleString('vi-VN')} ₫. Tốt nghiệp sau ${university.durationMonths} tháng (có thể thi tốt nghiệp sớm khi đạt ${Math.round(EARLY_GRAD_MIN_PROGRESS * 100)}% thời gian).`,
        payload: { universityId, degreeId, monthlyTuition, totalTuition },
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

  /** Bắt đầu bài kiểm tra tốt nghiệp sớm: tạo 5 câu trắc nghiệm cơ bản do AI sinh theo ngành/lĩnh vực. */
  async startEarlyGraduateTest(userId: string, degreeId: string): Promise<EarlyGraduateStartResponse> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const degree = await this.repository.getDegreeForCharacter(degreeId, character.id, client);
      if (!degree) throw AppError.notFound('Degree');
      if (degree.status !== 'enrolled') {
        throw AppError.badRequest('Bằng cấp này đã tốt nghiệp hoặc bị hủy.');
      }
      const now = new Date();
      if (now >= degree.graduatesAt) {
        throw AppError.badRequest('Bạn đã đủ thời gian khóa học, vui lòng bấm "Tốt nghiệp" thay vì thi sớm.');
      }
      const progress = degreeProgress(degree.enrolledAt, degree.graduatesAt, now);
      if (!canEarlyGraduate(progress, degree.graduatesAt, now)) {
        const pct = Math.round(progress * 1000) / 10;
        throw AppError.badRequest(`Chưa đủ điều kiện thi tốt nghiệp sớm. Tiến độ hiện tại ${pct}% (cần >= ${Math.round(EARLY_GRAD_MIN_PROGRESS * 100)}% thời gian khóa học).`);
      }

      // Tái sử dụng bài test đang chờ (chưa hết hạn) nếu có
      const existing = await this.repository.getLatestPendingEarlyGradTest(client, degreeId, character.id);
      if (existing) {
        return {
          testId: existing.id,
          degreeId,
          title: existing.title || 'Bài kiểm tra tốt nghiệp sớm',
          questions: existing.questions.map((q: { id: number; question: string; options: string[] }) => ({ id: q.id, question: q.question, options: q.options })),
          expiresAt: existing.expiresAt.toISOString(),
          requiredScore: existing.requiredScore,
          totalQuestions: existing.questions.length,
        };
      }

      // Gọi AI sinh 5 câu hỏi cơ bản theo ngành/lĩnh vực
      const aiRes = await callAiService<any>('/v1/education/quiz', {
        degree_id: degree.id,
        degree_code: degree.degreeCode,
        university_name: degree.universityName,
        field: degree.field,
        language: 'vi',
      });

      const fallbackQuestions = [
        { id: 1, question: `Kiến thức nền tảng nào là quan trọng trong ngành ${degree.degreeCode}?`, options: ['Nắm vững nguyên lý cơ bản', 'Bỏ qua lý thuyết', 'Không cần thực hành', 'Làm ngẫu nhiên'], correct_index: 0, explanation: 'Nền tảng giúp áp dụng đúng chuyên môn.' },
        { id: 2, question: 'Bước đầu tiên khi giải quyết vấn đề chuyên môn cơ bản là gì?', options: ['Xác định vấn đề và yêu cầu', 'Kết luận ngay', 'Bỏ qua dữ liệu', 'Đoán mò'], correct_index: 0, explanation: 'Xác định vấn đề giúp định hướng giải pháp.' },
        { id: 3, question: 'Thái độ nghề nghiệp cơ bản nào sau đây là đúng?', options: ['Trung thực và tuân thủ quy định', 'Gian lận', 'Phớt lờ trách nhiệm', 'Che giấu sai sót'], correct_index: 0, explanation: 'Trung thực và tuân thủ là chuẩn mực cơ bản.' },
        { id: 4, question: 'Để vận dụng kiến thức vào thực tế hiệu quả cần làm gì?', options: ['Thực hành và đánh giá', 'Chỉ học thuộc', 'Tránh phản hồi', 'Không cải tiến'], correct_index: 0, explanation: 'Thực hành và đánh giá giúp cải thiện năng lực.' },
        { id: 5, question: `Khi gặp tình huống chưa rõ trong lĩnh vực ${degree.field || degree.degreeCode}, bạn nên làm gì?`, options: ['Tra cứu và kiểm chứng', 'Đoán mò', 'Bỏ qua', 'Tự ý làm sai quy trình'], correct_index: 0, explanation: 'Tra cứu và kiểm chứng giúp quyết định chính xác.' },
      ];

      const rawQs = Array.isArray(aiRes.data?.questions) ? aiRes.data.questions : fallbackQuestions;
      const questions = rawQs.slice(0, 5).map((q: any, idx: number) => {
        const options = Array.isArray(q?.options) && q.options.length >= 2 ? q.options.map(String).slice(0, 4) : fallbackQuestions[idx]!.options;
        let correct = Number.isInteger(q?.correct_index) ? Number(q.correct_index) : 0;
        if (correct < 0 || correct >= options.length) correct = 0;
        return {
          id: idx + 1,
          question: String(q?.question || fallbackQuestions[idx]!.question),
          options,
          correct_index: correct,
          explanation: String(q?.explanation || ''),
        };
      });
      while (questions.length < 5) questions.push(fallbackQuestions[questions.length]!);

      const testId = crypto.randomUUID();
      const title = String(aiRes.data?.title || `Bài kiểm tra tốt nghiệp sớm - ${degree.degreeCode}`);
      await this.repository.createEarlyGradTest(client, {
        id: testId,
        degreeId,
        characterId: character.id,
        title,
        questions,
        requiredScore: EARLY_GRAD_PASS_SCORE,
      });

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await client.query(`UPDATE education_early_grad_tests SET expires_at = $2 WHERE id = $1`, [testId, expiresAt]);

      return {
        testId,
        degreeId,
        title,
        questions: questions.map((q: { id: number; question: string; options: string[] }) => ({ id: q.id, question: q.question, options: q.options })),
        expiresAt: expiresAt.toISOString(),
        requiredScore: EARLY_GRAD_PASS_SCORE,
        totalQuestions: 5,
      };
    });
  }

  /** Nộp bài kiểm tra tốt nghiệp sớm (5 câu trắc nghiệm do AI sinh). Đạt yêu cầu sẽ ra trường sớm. */
  async submitEarlyGraduateTest(
    userId: string,
    input: { degreeId: string; testId: string; answers: Array<{ questionId: number; selectedIndex: number }> },
  ): Promise<EarlyGraduateResultDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const degree = await this.repository.getDegreeForCharacter(input.degreeId, character.id, client);
      if (!degree) throw AppError.notFound('Degree');
      if (degree.status !== 'enrolled') {
        throw AppError.badRequest('Bằng cấp này đã tốt nghiệp hoặc bị hủy.');
      }

      const test = await this.repository.getPendingEarlyGradTest(client, input.testId, input.degreeId, character.id);
      if (!test) throw AppError.notFound('Bài kiểm tra (không tìm thấy hoặc không thuộc về bạn).');
      if (test.status !== 'pending') {
        throw AppError.badRequest('Bài kiểm tra này đã được nộp hoặc không còn hiệu lực.');
      }
      if (new Date() > test.expiresAt) {
        await this.repository.submitEarlyGradTest(client, test.id, 'expired', 0);
        throw AppError.badRequest('Bài kiểm tra đã hết hạn. Vui lòng bắt đầu bài kiểm tra mới.');
      }

      const answerMap = new Map<number, number>();
      for (const a of input.answers || []) answerMap.set(Number(a.questionId), Number(a.selectedIndex));

      let correctCount = 0;
      for (const q of test.questions) {
        const sel = answerMap.get(q.id);
        if (typeof sel === 'number' && sel === q.correct_index) correctCount++;
      }
      const total = test.questions.length || 5;
      const score = Math.round((correctCount / total) * 100);
      const passed = score >= (test.requiredScore ?? EARLY_GRAD_PASS_SCORE);

      if (!passed) {
        await this.repository.submitEarlyGradTest(client, test.id, 'failed', score);
        await notify(client, {
          userId,
          kind: 'education',
          title: 'Thi tốt nghiệp sớm chưa đạt',
          body: `Bạn trả lời đúng ${correctCount}/${total} câu (${score}/100, cần >= ${test.requiredScore}). Bạn có thể làm bài kiểm tra mới sau khi ôn tập.`,
          payload: { degreeId: input.degreeId, testId: test.id, score, correctCount, total },
        });
        return {
          passed: false,
          score,
          requiredScore: test.requiredScore,
          correctCount,
          totalQuestions: total,
          message: `Bài kiểm tra tốt nghiệp sớm: đúng ${correctCount}/${total} câu (${score}/100, cần >= ${test.requiredScore}). Chưa đạt, bạn có thể bắt đầu bài kiểm tra mới.`,
          graduation: null,
        };
      }

      await this.repository.submitEarlyGradTest(client, test.id, 'passed', score);
      // ensure still eligible at submit time (>=2/3) or allow if was eligible when started; be lenient: allow if pending and within time window
      const grad = await this.finalizeGraduation(client, userId, character.id, degree, 'Tốt nghiệp sớm!');
      return {
        passed: true,
        score,
        requiredScore: test.requiredScore,
        correctCount,
        totalQuestions: total,
        message: `Chúc mừng! Bạn trả lời đúng ${correctCount}/${total} câu (${score}/100) và được tốt nghiệp sớm.`,
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
