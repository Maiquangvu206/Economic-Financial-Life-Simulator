import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { notify } from '../notifications/notification.service.js';
import { MoneySchema, type EmploymentDto, type RecruitmentOverviewDto } from '@efls/contracts';
import { recruitmentRepository, type GameDayState, type RecruitmentJobRow } from './recruitment.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function gameAbs(g: GameDayState): number {
  return g.year * 360 + g.dayOfYear;
}

function employmentDto(row: { id: string; jobId: string; title: string; industry: string; salaryMinor: string; status: string; hiredAt: Date }): EmploymentDto {
  return {
    id: row.id,
    jobId: row.jobId,
    title: row.title,
    industry: row.industry as EmploymentDto['industry'],
    salary: money(Number(row.salaryMinor)),
    status: row.status as EmploymentDto['status'],
    hiredAt: row.hiredAt.toISOString(),
  };
}

export class RecruitmentService {
  constructor(private readonly repo = recruitmentRepository) {}

  async getOverview(userId: string): Promise<RecruitmentOverviewDto> {
    const db = this.repo.db;
    const character = await requireCharacterByUserId(db, userId);
    const [jobs, employment, myCompanies, game] = await Promise.all([
      this.repo.listVisibleJobs(character.id, db),
      this.repo.getActiveEmployment(character.id, db),
      this.repo.listMyCompanies(character.id, db),
      this.repo.getGameDay(db),
    ]);

    const ownsCompany = myCompanies.length > 0;
    const canApplyJobs = !employment;
    const applyBlocker = canApplyJobs ? null : 'Bạn đang có việc làm, không thể ứng tuyển vị trí mới.';

    const creditScore = Number((character as any).credit_score ?? 0);
    const degreeCodesRes = await db.query<{ degree_code: string }>(
      `SELECT degree_code FROM degrees WHERE character_id = $1 AND status = 'graduated'`,
      [character.id],
    );
    const graduatedCodes = new Set(degreeCodesRes.rows.map((r) => r.degree_code));
    const nowAbs = gameAbs(game);

    return {
      jobs: jobs.map((j) => this.mapJobDto(j, character.id, canApplyJobs, creditScore, graduatedCodes, nowAbs)),
      employment: employment ? employmentDto(employment) : null,
      canPostJobs: ownsCompany,
      canApplyJobs,
      applyBlocker,
      myCompanies,
      currentGame: { year: game.year, dayOfYear: game.dayOfYear },
    };
  }

  private mapJobDto(
    j: RecruitmentJobRow,
    myCharacterId: string,
    canApplyJobs: boolean,
    creditScore: number,
    graduatedCodes: Set<string>,
    nowAbs: number,
  ) {
    const postingStatus = (j.postingStatus ?? 'open') as 'open' | 'closed' | 'deleted';
    const degreeOk = !j.requiredDegree || graduatedCodes.has(j.requiredDegree);
    const creditOk = creditScore >= Number(j.minCreditScore ?? 0);
    const eligible = degreeOk && creditOk;
    let blocker = !degreeOk
      ? `Yêu cầu bằng cấp: ${j.requiredDegree}`
      : !creditOk
        ? `Yêu cầu điểm tín dụng tối thiểu: ${j.minCreditScore}`
        : null;
    if (postingStatus === 'closed') blocker = blocker ?? 'Đợt tuyển đã đóng.';
    const isMine = !!j.ownerCharacterId && j.ownerCharacterId === myCharacterId;
    const canApply =
      postingStatus === 'open' &&
      canApplyJobs &&
      eligible &&
      !isMine &&
      Number(j.openings ?? 0) > 0 &&
      (j.companyStatus === 'active' || j.companyStatus === 'ipo');

    const closedAbs =
      postingStatus === 'closed' && j.closedGameYear != null && j.closedGameDay != null
        ? j.closedGameYear * 360 + j.closedGameDay
        : null;
    const canDelete = isMine && postingStatus === 'closed' && closedAbs != null && nowAbs - closedAbs >= 1;
    const deleteEligibleAt =
      postingStatus === 'closed' && closedAbs != null && !canDelete
        ? 'Sau ít nhất 1 ngày game kể từ khi đóng'
        : canDelete
          ? 'Có thể xóa ngay'
          : null;

    return {
      id: j.id,
      title: j.title,
      industry: j.industry as any,
      baseSalary: money(Number(j.baseSalaryMinor)),
      requiredDegree: j.requiredDegree,
      minCreditScore: Number(j.minCreditScore ?? 0),
      energyCost: Number(j.energyCost ?? 0),
      openings: Number(j.openings ?? 0),
      companyId: j.companyId,
      companyName: j.companyName,
      ownerCharacterId: j.ownerCharacterId,
      ownerName: j.ownerName,
      postingStatus,
      closedAt: j.closedAt ? new Date(j.closedAt).toISOString() : null,
      closedGameYear: j.closedGameYear ?? null,
      closedGameDay: j.closedGameDay ?? null,
      canClose: isMine && postingStatus === 'open',
      canDelete,
      deleteEligibleAt,
      eligible,
      blocker,
      canApply,
      isMine,
    };
  }

  async createJob(userId: string, input: { companyId: string; title: string; industry: string; baseSalaryMinor: number; requiredDegree?: string | null; minCreditScore?: number; energyCost?: number; openings?: number }) {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await client.query<{ id: string; name: string; status: string }>(
        `SELECT id, name, status FROM companies WHERE id = $1 AND owner_character_id = $2`,
        [input.companyId, character.id],
      );
      const c = company.rows[0];
      if (!c) throw AppError.forbidden('Chỉ chủ sở hữu công ty mới có thể đăng tin tuyển dụng cho công ty này.');
      if (c.status === 'bankrupt') throw AppError.badRequest('Công ty đã giải thể/phá sản, không thể đăng tuyển.');

      const jobId = await this.repo.createCompanyJob(client, {
        companyId: input.companyId,
        title: input.title.trim(),
        industry: input.industry,
        baseSalaryMinor: input.baseSalaryMinor,
        requiredDegree: input.requiredDegree || null,
        minCreditScore: input.minCreditScore ?? 0,
        energyCost: input.energyCost ?? 10,
        openings: input.openings ?? 1,
      });

      await notify(client, {
        userId,
        kind: 'recruitment',
        title: 'Đã đăng tin tuyển dụng',
        body: `Công ty "${c.name}" đã đăng tuyển: ${input.title} (${input.openings ?? 1} vị trí).`,
        payload: { jobId, companyId: input.companyId },
      });

      return { id: jobId };
    });
  }

  async closeJob(userId: string, jobId: string) {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const [job, game] = await Promise.all([this.repo.getJob(jobId, client), this.repo.getGameDay(client)]);
      if (!job || !job.companyId) throw AppError.notFound('Job');
      if (job.ownerCharacterId !== character.id) throw AppError.forbidden('Chỉ chủ sở hữu công ty mới được đóng đợt tuyển.');
      if ((job.postingStatus ?? 'open') === 'deleted') throw AppError.notFound('Job');
      if ((job.postingStatus ?? 'open') === 'closed') {
        return { ok: true, alreadyClosed: true };
      }
      const updated = await this.repo.closeJobPosting(client, jobId, character.id, game);
      if (!updated) throw AppError.badRequest('Không thể đóng đợt tuyển (có thể đã đóng hoặc không hợp lệ).');
      await notify(client, {
        userId,
        kind: 'recruitment',
        title: 'Đã đóng đợt tuyển',
        body: `Đợt tuyển "${job.title}" (${job.companyName ?? 'công ty'}) đã được đóng. Sau ít nhất 1 ngày game bạn có thể xóa.`,
        payload: { jobId, companyId: job.companyId, closedGameYear: game.year, closedGameDay: game.dayOfYear },
      });
      return { ok: true, postingStatus: 'closed', closedGameYear: game.year, closedGameDay: game.dayOfYear };
    });
  }

  async deleteJob(userId: string, jobId: string) {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const [job, game] = await Promise.all([this.repo.getJob(jobId, client), this.repo.getGameDay(client)]);
      if (!job || !job.companyId) throw AppError.notFound('Job');
      if (job.ownerCharacterId !== character.id) throw AppError.forbidden('Chỉ chủ sở hữu công ty mới được xóa đợt tuyển.');
      const status = (job.postingStatus ?? 'open') as 'open' | 'closed' | 'deleted';
      if (status === 'deleted') return { ok: true, deleted: true };
      if (status !== 'closed') {
        throw AppError.badRequest('Chỉ có thể xóa đợt tuyển sau khi đã đóng.');
      }
      if (job.closedGameYear == null || job.closedGameDay == null) {
        throw AppError.badRequest('Thiếu thời điểm đóng đợt tuyển. Vui lòng đóng lại.');
      }
      const nowAbs = gameAbs(game);
      const closedAbs = job.closedGameYear * 360 + job.closedGameDay;
      if (nowAbs - closedAbs < 1) {
        throw AppError.badRequest('Chưa đủ 1 ngày game kể từ khi đóng đợt tuyển. Vui lòng chờ thêm.');
      }
      const mode = await this.repo.deleteJobRowIfUnreferenced(client, jobId);
      await notify(client, {
        userId,
        kind: 'recruitment',
        title: 'Đã xóa đợt tuyển',
        body: `Đợt tuyển "${job.title}" (${job.companyName ?? 'công ty'}) đã được xóa.`,
        payload: { jobId, companyId: job.companyId, mode },
      });
      return { ok: true, deleted: true, mode };
    });
  }

  async apply(userId: string, jobId: string) {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const [job, employment] = await Promise.all([
        this.repo.getJob(jobId, client),
        this.repo.getActiveEmployment(character.id, client),
      ]);

      if (!job) throw AppError.notFound('Job');
      if ((job.postingStatus ?? 'open') !== 'open') {
        throw AppError.badRequest('Đợt tuyển đã đóng hoặc không còn nhận hồ sơ.');
      }
      if (!job.companyId || !job.companyStatus || (job.companyStatus !== 'active' && job.companyStatus !== 'ipo')) {
        throw AppError.badRequest('Tin tuyển dụng không còn hợp lệ.');
      }
      if (job.openings <= 0) throw AppError.conflict('no_openings', 'Vị trí này đã hết chỉ tiêu tuyển dụng.');
      if (employment) throw AppError.conflict('already_employed', 'Bạn đang có việc làm, không thể ứng tuyển.');

      if (job.requiredDegree) {
        const deg = await client.query(`SELECT 1 FROM degrees WHERE character_id = $1 AND status = 'graduated' AND degree_code = $2 LIMIT 1`, [character.id, job.requiredDegree]);
        if (!deg.rows[0]) throw AppError.forbidden(`Bạn chưa đáp ứng yêu cầu bằng cấp/chứng chỉ: ${job.requiredDegree}.`);
      }
      const creditScore = Number((character as any).credit_score ?? 0);
      if (creditScore < Number(job.minCreditScore ?? 0)) {
        throw AppError.forbidden(`Điểm tín dụng chưa đạt yêu cầu (${job.minCreditScore}).`);
      }

      let employmentId: string;
      try {
        employmentId = await this.repo.applyToJob(client, character.id, job);
      } catch (e: any) {
        if (String(e?.message).includes('JOB_NO_OPENINGS')) throw AppError.conflict('no_openings', 'Vị trí này đã hết chỉ tiêu tuyển dụng.');
        throw e;
      }

      await notify(client, {
        userId,
        kind: 'recruitment',
        title: 'Ứng tuyển thành công',
        body: `Bạn đã được nhận vào vị trí "${job.title}" tại ${job.companyName ?? 'công ty'}.`,
        payload: { jobId: job.id, employmentId, companyId: job.companyId },
      });

      if (job.ownerCharacterId) {
        const owner = await client.query<{ user_id: string }>(`SELECT user_id FROM characters WHERE id = $1`, [job.ownerCharacterId]);
        const ownerUserId = owner.rows[0]?.user_id;
        if (ownerUserId) {
          await notify(client, {
            userId: ownerUserId,
            kind: 'recruitment',
            title: 'Ứng viên mới được nhận',
            body: `Có nhân vật mới ứng tuyển và được nhận vào vị trí "${job.title}" tại ${job.companyName ?? 'công ty'}.`,
            payload: { jobId: job.id, employmentId, applicantCharacterId: character.id },
          });
        }
      }

      return { employmentId, jobId: job.id };
    });
  }
}

export const recruitmentService = new RecruitmentService();
