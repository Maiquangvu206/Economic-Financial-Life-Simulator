import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { notify } from '../notifications/notification.service.js';
import { assertNotOnActiveTrip } from '../../shared/wellness/activeTrip.js';
import { MoneySchema, type EmploymentDto, type RecruitmentJobApplicationDto, type RecruitmentOverviewDto, type ResignEmploymentResponse } from '@efls/contracts';
import { recruitmentRepository, type GameDayState, type JobApplicationRow, type RecruitmentJobRow } from './recruitment.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function gameAbs(g: GameDayState): number {
  return g.year * 360 + g.dayOfYear;
}

function employmentDto(
  row: {
    id: string; jobId: string; title: string; industry: string; salaryMinor: string; status: string; hiredAt: Date;
    companyId?: string | null; companyName?: string | null; companyOwnerCharacterId?: string | null; isOwnerRole?: boolean;
    resignRequestedAt?: Date | null; effectiveResignGameYear?: number | null; effectiveResignGameDay?: number | null;
  },
  ctx?: { currentAbs?: number; characterId?: string },
): EmploymentDto {
  let daysUntilResign: number | null | undefined = undefined;
  if (row.status === 'notice_pending' && row.effectiveResignGameYear != null && row.effectiveResignGameDay != null && ctx?.currentAbs != null) {
    const effAbs = Number(row.effectiveResignGameYear) * 360 + Number(row.effectiveResignGameDay);
    daysUntilResign = Math.max(0, effAbs - ctx.currentAbs);
  } else if (row.status === 'notice_pending') {
    daysUntilResign = null;
  }
  return {
    id: row.id,
    jobId: row.jobId,
    title: row.title,
    industry: row.industry as EmploymentDto['industry'],
    salary: money(Number(row.salaryMinor)),
    status: row.status as EmploymentDto['status'],
    hiredAt: row.hiredAt.toISOString(),
    companyId: row.companyId ?? null,
    companyName: row.companyName ?? null,
    isOwnerRole: Boolean(row.isOwnerRole),
    isCompanyOwner: !!(ctx?.characterId && row.companyOwnerCharacterId && row.companyOwnerCharacterId === ctx.characterId),
    resignRequestedAt: row.resignRequestedAt ? new Date(row.resignRequestedAt).toISOString() : null,
    effectiveResignGameYear: row.effectiveResignGameYear ?? null,
    effectiveResignGameDay: row.effectiveResignGameDay ?? null,
    daysUntilResign,
  };
}

function applicationDto(row: JobApplicationRow): RecruitmentJobApplicationDto {
  return {
    id: row.id,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    companyId: row.companyId,
    companyName: row.companyName,
    applicantCharacterId: row.applicantCharacterId,
    applicantName: row.applicantName,
    applicantCccd: row.applicantCccd ?? null,
    status: row.status,
    note: row.note ?? null,
    decisionNote: row.decisionNote ?? null,
    decidedByCharacterId: row.decidedByCharacterId ?? null,
    decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : null,
    employmentId: row.employmentId ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    salary: row.baseSalaryMinor != null ? money(Number(row.baseSalaryMinor)) : null,
  };
}

export class RecruitmentService {
  constructor(private readonly repo = recruitmentRepository) {}

  async getOverview(userId: string): Promise<RecruitmentOverviewDto> {
    const db = this.repo.db;
    const character = await requireCharacterByUserId(db, userId);
    const [jobs, employment, myCompanies, game] = await Promise.all([
      this.repo.listVisibleJobs(character.id, db),
      this.repo.getCurrentEmployment(character.id, db),
      this.repo.listMyCompanies(character.id, db),
      this.repo.getGameDay(db),
    ]);

    const ownsCompany = myCompanies.length > 0;
    const canApplyJobs = !employment;
    const applyBlocker = canApplyJobs
      ? null
      : employment?.status === 'notice_pending'
        ? 'Bạn đang trong thời gian báo trước nghỉ việc, chưa thể ứng tuyển vị trí mới.'
        : 'Bạn đang có việc làm, không thể ứng tuyển vị trí mới.';

    const creditScore = Number((character as any).credit_score ?? 0);
    const degreeCodesRes = await db.query<{ degree_code: string }>(
      `SELECT degree_code FROM degrees WHERE character_id = $1 AND status = 'graduated'`,
      [character.id],
    );
    const graduatedCodes = new Set(degreeCodesRes.rows.map((r) => r.degree_code));
    const nowAbs = gameAbs(game);

    const jobIds = jobs.map((j) => j.id);
    let myPendingJobIds = new Set<string>();
    let pendingCounts = new Map<string, number>();
    let myApplications: RecruitmentJobApplicationDto[] = [];
    let incomingApplications: RecruitmentJobApplicationDto[] = [];

    try {
      const [myPending, counts, myApps, incoming] = await Promise.all([
        this.repo.getPendingApplicationIdsForApplicant(character.id, jobIds, db),
        ownsCompany ? this.repo.getPendingApplicationCountsForJobs(jobIds, db) : Promise.resolve(new Map<string, number>()),
        this.repo.listApplicationsByApplicant(character.id, db),
        ownsCompany ? this.repo.listIncomingApplicationsForOwner(character.id, db) : Promise.resolve([]),
      ]);
      myPendingJobIds = myPending;
      pendingCounts = counts;
      myApplications = myApps.map(applicationDto);
      incomingApplications = incoming.map(applicationDto);
    } catch {
      // Backward-compatible when migration 0084 not applied yet
    }

    return {
      jobs: jobs.map((j) => this.mapJobDto(j, character.id, canApplyJobs, creditScore, graduatedCodes, nowAbs, myPendingJobIds.has(j.id), pendingCounts.get(j.id) ?? 0)),
      employment: employment ? employmentDto(employment as any, { currentAbs: nowAbs, characterId: character.id }) : null,
      canPostJobs: ownsCompany,
      canApplyJobs,
      applyBlocker,
      myCompanies,
      currentGame: { year: game.year, dayOfYear: game.dayOfYear },
      myApplications,
      incomingApplications,
    };
  }

  private mapJobDto(
    j: RecruitmentJobRow,
    myCharacterId: string,
    canApplyJobs: boolean,
    creditScore: number,
    graduatedCodes: Set<string>,
    nowAbs: number,
    hasPendingApplication = false,
    pendingApplicationsCount = 0,
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
    if (hasPendingApplication) blocker = 'Bạn đã gửi hồ sơ ứng tuyển và đang chờ duyệt.';
    const isMine = !!j.ownerCharacterId && j.ownerCharacterId === myCharacterId;
    const canApply =
      postingStatus === 'open' &&
      canApplyJobs &&
      eligible &&
      !isMine &&
      !hasPendingApplication &&
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
      hasPendingApplication,
      pendingApplicationsCount: isMine ? pendingApplicationsCount : 0,
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
      await this.repo.cancelPendingApplicationsForJob(client, jobId).catch(() => 0);
      await notify(client, {
        userId,
        kind: 'recruitment',
        title: 'Đã đóng đợt tuyển',
        body: `Đợt tuyển "${job.title}" (${job.companyName ?? 'công ty'}) đã được đóng. Hồ sơ ứng tuyển đang chờ (nếu có) đã được hủy. Sau ít nhất 1 ngày game bạn có thể xóa.`,
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
      await this.repo.cancelPendingApplicationsForJob(client, jobId).catch(() => 0);
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
      await assertNotOnActiveTrip(client, character.id, 'ứng tuyển việc làm');
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
      if (job.ownerCharacterId === character.id) {
        throw AppError.badRequest('Bạn không thể ứng tuyển vào tin tuyển dụng của chính công ty mình.');
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

      const hasPending = await this.repo.hasPendingApplication(job.id, character.id, client).catch(() => false);
      if (hasPending) {
        throw AppError.conflict('application_pending', 'Bạn đã gửi hồ sơ ứng tuyển vị trí này và đang chờ duyệt.');
      }

      const applicationId = await this.repo.createJobApplication(client, {
        jobId: job.id,
        companyId: job.companyId,
        applicantCharacterId: character.id,
      });

      await notify(client, {
        userId,
        kind: 'recruitment',
        title: 'Đã gửi hồ sơ ứng tuyển',
        body: `Hồ sơ ứng tuyển vị trí "${job.title}" tại ${job.companyName ?? 'công ty'} đã được gửi và đang chờ chủ doanh nghiệp duyệt.`,
        payload: { jobId: job.id, applicationId, companyId: job.companyId },
      });

      if (job.ownerCharacterId) {
        const owner = await client.query<{ user_id: string }>(`SELECT user_id FROM characters WHERE id = $1`, [job.ownerCharacterId]);
        const ownerUserId = owner.rows[0]?.user_id;
        if (ownerUserId) {
          await notify(client, {
            userId: ownerUserId,
            kind: 'recruitment',
            title: 'Hồ sơ ứng tuyển mới (chờ duyệt)',
            body: `Có ứng viên mới ứng tuyển vị trí "${job.title}" tại ${job.companyName ?? 'công ty'}. Vui lòng duyệt hoặc từ chối hồ sơ.`,
            payload: { jobId: job.id, applicationId, applicantCharacterId: character.id },
          });
        }
      }

      return { applicationId, jobId: job.id, status: 'pending' };
    });
  }

  async decideApplication(userId: string, applicationId: string, decision: 'approve' | 'reject', note?: string | null) {
    return withTransaction(async (client) => {
      const actor = await requireLivingCharacterByUserId(client, userId);
      const app = await this.repo.getApplicationForDecision(client, applicationId);
      if (!app) throw AppError.notFound('Application');
      if (app.ownerCharacterId !== actor.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu công ty mới được duyệt hoặc từ chối hồ sơ ứng tuyển.');
      }
      if (app.status !== 'pending') {
        throw AppError.badRequest('Hồ sơ ứng tuyển này đã được xử lý.');
      }

      if (decision === 'reject') {
        await this.repo.decideApplication(client, applicationId, {
          status: 'rejected',
          decidedByCharacterId: actor.id,
          decisionNote: note?.trim() || null,
        });
        if (app.applicantUserId) {
          await notify(client, {
            userId: app.applicantUserId,
            kind: 'recruitment',
            title: 'Hồ sơ ứng tuyển bị từ chối',
            body: `Hồ sơ ứng tuyển vị trí "${app.jobTitle}" tại ${app.jobCompanyName ?? 'công ty'} đã bị từ chối.${note?.trim() ? ` Lý do: ${note.trim()}` : ''}`,
            payload: { applicationId, jobId: app.jobId, status: 'rejected' },
          });
        }
        return { ok: true, status: 'rejected' as const, applicationId };
      }

      // Approve: validate current state and hire atomically
      if ((app.jobPostingStatus ?? 'open') !== 'open') {
        throw AppError.badRequest('Đợt tuyển đã đóng, không thể duyệt nhận việc.');
      }
      if (!app.jobCompanyId || !app.jobCompanyStatus || !['active', 'ipo'].includes(app.jobCompanyStatus)) {
        throw AppError.badRequest('Công ty/tin tuyển dụng không còn hợp lệ để nhận việc.');
      }
      if (Number(app.jobOpenings ?? 0) <= 0) {
        throw AppError.conflict('no_openings', 'Vị trí này đã hết chỉ tiêu tuyển dụng.');
      }

      const [employment, applicantChar] = await Promise.all([
        this.repo.getActiveEmployment(app.applicantCharacterId, client),
        client.query<{ credit_score: number | null }>(`SELECT credit_score FROM characters WHERE id = $1`, [app.applicantCharacterId]),
      ]);
      if (employment) {
        throw AppError.conflict('already_employed', 'Ứng viên hiện đã có việc làm, không thể duyệt nhận việc.');
      }
      if (app.jobRequiredDegree) {
        const deg = await client.query(
          `SELECT 1 FROM degrees WHERE character_id = $1 AND status = 'graduated' AND degree_code = $2 LIMIT 1`,
          [app.applicantCharacterId, app.jobRequiredDegree],
        );
        if (!deg.rows[0]) {
          throw AppError.forbidden(`Ứng viên chưa đáp ứng yêu cầu bằng cấp/chứng chỉ: ${app.jobRequiredDegree}.`);
        }
      }
      const creditScore = Number(applicantChar.rows[0]?.credit_score ?? 0);
      if (creditScore < Number(app.jobMinCreditScore ?? 0)) {
        throw AppError.forbidden(`Ứng viên chưa đạt điểm tín dụng tối thiểu (${app.jobMinCreditScore}).`);
      }

      const updated = await client.query(
        `UPDATE jobs
            SET openings = openings - 1
          WHERE id = $1
            AND openings > 0
            AND COALESCE(posting_status, 'open') = 'open'`,
        [app.jobId],
      );
      if ((updated.rowCount ?? 0) === 0) {
        throw AppError.conflict('no_openings', 'Vị trí này đã hết chỉ tiêu tuyển dụng.');
      }

      const empRes = await client.query<{ id: string }>(
        `INSERT INTO employments (id, character_id, job_id, company_id, salary_minor, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active')
         RETURNING id`,
        [app.applicantCharacterId, app.jobId, app.jobCompanyId ?? app.companyId, Number(app.jobBaseSalaryMinor)],
      );
      const employmentId = empRes.rows[0]!.id;

      await this.repo.decideApplication(client, applicationId, {
        status: 'approved',
        decidedByCharacterId: actor.id,
        decisionNote: note?.trim() || null,
        employmentId,
      });

      if (app.applicantUserId) {
        await notify(client, {
          userId: app.applicantUserId,
          kind: 'recruitment',
          title: 'Hồ sơ ứng tuyển được duyệt',
          body: `Bạn đã được nhận vào vị trí "${app.jobTitle}" tại ${app.jobCompanyName ?? 'công ty'}.`,
          payload: { applicationId, jobId: app.jobId, employmentId, status: 'approved' },
        });
      }

      await notify(client, {
        userId,
        kind: 'recruitment',
        title: 'Đã duyệt nhận việc',
        body: `Bạn đã duyệt và nhận ${app.applicantName ?? 'ứng viên'} vào vị trí "${app.jobTitle}".`,
        payload: { applicationId, jobId: app.jobId, employmentId, applicantCharacterId: app.applicantCharacterId },
      });

      return { ok: true, status: 'approved' as const, applicationId, employmentId, jobId: app.jobId };
    });
  }

  async resignCurrentEmployment(userId: string): Promise<ResignEmploymentResponse> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      await assertNotOnActiveTrip(client, character.id, 'thực hiện thủ tục nghỉ việc');
      const employment = await this.repo.getCurrentEmployment(character.id, client);
      if (!employment || employment.status !== 'active') {
        if (employment?.status === 'notice_pending') {
          throw AppError.badRequest('Bạn đã gửi yêu cầu thôi việc và đang trong thời gian báo trước.');
        }
        throw AppError.badRequest('Bạn hiện không có việc làm đang hoạt động để xin thôi việc.');
      }

      const isCompanyOwner = !!(employment.companyId && employment.companyOwnerCharacterId === character.id);
      if (employment.isOwnerRole || isCompanyOwner) {
        throw AppError.forbidden('Chủ doanh nghiệp không thể tự thôi việc như nhân viên thường. Vui lòng chuyển nhượng hoặc giải thể công ty trước.');
      }

      const game = await this.repo.getGameDay(client);
      const nowAbs = gameAbs(game);
      const effectiveAbs = nowAbs + 10;
      const effectiveYear = Math.floor(effectiveAbs / 360);
      const effectiveDayOfYear = ((effectiveAbs % 360) + 360) % 360;

      const updated = await this.repo.requestResign(client, employment.id, character.id, effectiveYear, effectiveDayOfYear);
      if (!updated) {
        throw AppError.conflict('resign_failed', 'Không thể gửi yêu cầu thôi việc. Vui lòng thử lại.');
      }

      await notify(client, {
        userId,
        kind: 'recruitment',
        title: 'Đã gửi yêu cầu thôi việc',
        body: `Bạn đã xin thôi việc vị trí "${employment.title}". Thời gian báo trước 10 ngày game và sẽ chính thức nghỉ khi đến hạn.`,
        payload: {
          employmentId: employment.id,
          effectiveResignGameYear: effectiveYear,
          effectiveResignGameDay: effectiveDayOfYear,
          daysRemaining: 10,
        },
      });

      return {
        ok: true,
        employmentId: employment.id,
        status: 'notice_pending',
        effectiveResignGameYear: effectiveYear,
        effectiveResignGameDay: effectiveDayOfYear,
        daysRemaining: 10,
        message: 'Đã ghi nhận yêu cầu thôi việc. Bạn sẽ chính thức nghỉ việc sau 10 ngày game.',
      };
    });
  }
}

export const recruitmentService = new RecruitmentService();
