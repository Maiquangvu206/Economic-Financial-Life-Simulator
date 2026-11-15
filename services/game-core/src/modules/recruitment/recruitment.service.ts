import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { notify } from '../notifications/notification.service.js';
import { MoneySchema, type EmploymentDto, type RecruitmentOverviewDto } from '@efls/contracts';
import { recruitmentRepository } from './recruitment.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
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
    const [jobs, employment, myCompanies, graduatedCount] = await Promise.all([
      this.repo.listCompanyJobs(db),
      this.repo.getActiveEmployment(character.id, db),
      this.repo.listMyCompanies(character.id, db),
      this.repo.countGraduatedDegrees(character.id, db),
    ]);

    const ownsCompany = myCompanies.length > 0;
    const isNewGraduate = graduatedCount > 0;
    const canApplyJobs = isNewGraduate && !ownsCompany && !employment;
    const applyBlocker = canApplyJobs
      ? null
      : employment
        ? 'Bạn đang có việc làm, không thể ứng tuyển vị trí mới.'
        : !isNewGraduate
          ? 'Chỉ nhân vật mới ra trường (đã tốt nghiệp ít nhất 1 bằng) mới có thể ứng tuyển tại trang tuyển dụng.'
          : ownsCompany
            ? 'Nhân vật đã có công ty không thể ứng tuyển tại trang tuyển dụng.'
            : 'Không đủ điều kiện ứng tuyển.';

    const creditScore = Number((character as any).credit_score ?? 0);
    const degreeCodesRes = await db.query<{ degree_code: string }>(
      `SELECT degree_code FROM degrees WHERE character_id = $1 AND status = 'graduated'`,
      [character.id],
    );
    const graduatedCodes = new Set(degreeCodesRes.rows.map((r) => r.degree_code));

    return {
      jobs: jobs.map((j) => {
        const degreeOk = !j.requiredDegree || graduatedCodes.has(j.requiredDegree);
        const creditOk = creditScore >= Number(j.minCreditScore ?? 0);
        const eligible = degreeOk && creditOk;
        const blocker = !degreeOk
          ? `Yêu cầu bằng cấp: ${j.requiredDegree}`
          : !creditOk
            ? `Yêu cầu điểm tín dụng tối thiểu: ${j.minCreditScore}`
            : null;
        const isMine = !!j.ownerCharacterId && j.ownerCharacterId === character.id;
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
          eligible,
          blocker,
          canApply: canApplyJobs && eligible && !isMine,
          isMine,
        };
      }),
      employment: employment ? employmentDto(employment) : null,
      canPostJobs: ownsCompany,
      canApplyJobs,
      applyBlocker,
      myCompanies,
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

  async apply(userId: string, jobId: string) {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const [job, employment, myCompanies, graduatedCount] = await Promise.all([
        this.repo.getJob(jobId, client),
        this.repo.getActiveEmployment(character.id, client),
        this.repo.listMyCompanies(character.id, client),
        this.repo.countGraduatedDegrees(character.id, client),
      ]);

      if (!job) throw AppError.notFound('Job');
      if (!job.companyId || !job.companyStatus || (job.companyStatus !== 'active' && job.companyStatus !== 'ipo')) {
        throw AppError.badRequest('Tin tuyển dụng không còn hợp lệ.');
      }
      if (job.openings <= 0) throw AppError.conflict('no_openings', 'Vị trí này đã hết chỉ tiêu tuyển dụng.');
      if (employment) throw AppError.conflict('already_employed', 'Bạn đang có việc làm, không thể ứng tuyển.');
      if (graduatedCount <= 0) throw AppError.forbidden('Chỉ nhân vật mới ra trường (đã tốt nghiệp ít nhất 1 bằng) mới có thể ứng tuyển.');
      if (myCompanies.length > 0) throw AppError.forbidden('Nhân vật đã có công ty không thể ứng tuyển tại trang tuyển dụng.');

      if (job.requiredDegree) {
        const deg = await client.query(`SELECT 1 FROM degrees WHERE character_id = $1 AND status = 'graduated' AND degree_code = $2 LIMIT 1`, [character.id, job.requiredDegree]);
        if (!deg.rows[0]) throw AppError.forbidden(`Bạn chưa đáp ứng yêu cầu bằng cấp: ${job.requiredDegree}.`);
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
