import type { Request, Response } from 'express';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { MoneySchema, type AdminEducationConfigDto, type UpsertUniversityRequest, type UpsertJobRequest } from '@efls/contracts';
import { educationRepository } from '../education/education.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function ensureAdminRole(req: Request): void {
  if (req.actorRole !== 'admin' && req.actorRole !== 'moderator') {
    throw AppError.forbidden('Admin role required');
  }
}

export async function getEducationConfig(req: Request, res: Response): Promise<void> {
  ensureAdminRole(req);
  const [universities, jobs] = await Promise.all([
    educationRepository.listUniversities(),
    educationRepository.listJobs(),
  ]);
  const dto: AdminEducationConfigDto = {
    universities: universities.map((u) => ({
      id: u.id,
      name: u.name,
      degreeCode: u.degreeCode,
      field: u.field as any,
      tuition: money(Number(u.tuitionMinor)),
      durationMonths: u.durationMonths,
      postGradSalary: u.postGradSalaryMinor != null ? money(Number(u.postGradSalaryMinor)) : null,
    })),
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      industry: j.industry as any,
      baseSalary: money(Number(j.baseSalaryMinor)),
      requiredDegree: j.requiredDegree,
      minCreditScore: j.minCreditScore,
      energyCost: j.energyCost,
      openings: j.openings,
    })),
  };
  res.status(200).json(dto);
}

export async function createUniversity(req: Request, res: Response): Promise<void> {
  ensureAdminRole(req);
  const body = req.body as UpsertUniversityRequest;
  await withTransaction(async (client) => {
    const id = await educationRepository.createUniversity(client, {
      name: body.name,
      degreeCode: body.degreeCode,
      field: body.field,
      tuitionMinor: body.tuitionMinor,
      durationMonths: body.durationMonths,
    });
    if (typeof body.postGradSalaryMinor === 'number') {
      await educationRepository.upsertPostGradSalary(client, body.degreeCode, body.field, body.postGradSalaryMinor);
    }
    res.status(201).json({ id });
  });
}

export async function updateUniversity(req: Request, res: Response): Promise<void> {
  ensureAdminRole(req);
  const { id } = req.params as { id: string };
  const body = req.body as UpsertUniversityRequest;
  await withTransaction(async (client) => {
    await educationRepository.updateUniversity(client, id, {
      name: body.name,
      degreeCode: body.degreeCode,
      field: body.field,
      tuitionMinor: body.tuitionMinor,
      durationMonths: body.durationMonths,
    });
    if (typeof body.postGradSalaryMinor === 'number') {
      await educationRepository.upsertPostGradSalary(client, body.degreeCode, body.field, body.postGradSalaryMinor);
    }
    res.status(200).json({ ok: true });
  });
}

export async function deleteUniversity(req: Request, res: Response): Promise<void> {
  ensureAdminRole(req);
  const { id } = req.params as { id: string };
  await withTransaction(async (client) => {
    await educationRepository.deleteUniversity(client, id);
    res.status(200).json({ ok: true });
  });
}

export async function createJob(req: Request, res: Response): Promise<void> {
  ensureAdminRole(req);
  const body = req.body as UpsertJobRequest;
  await withTransaction(async (client) => {
    const id = await educationRepository.createJob(client, {
      title: body.title,
      industry: body.industry,
      baseSalaryMinor: body.baseSalaryMinor,
      requiredDegree: body.requiredDegree ?? null,
      minCreditScore: body.minCreditScore ?? 0,
      energyCost: body.energyCost ?? 10,
      openings: body.openings ?? 1,
    });
    res.status(201).json({ id });
  });
}

export async function updateJob(req: Request, res: Response): Promise<void> {
  ensureAdminRole(req);
  const { id } = req.params as { id: string };
  const body = req.body as UpsertJobRequest;
  await withTransaction(async (client) => {
    await educationRepository.updateJob(client, id, {
      title: body.title,
      industry: body.industry,
      baseSalaryMinor: body.baseSalaryMinor,
      requiredDegree: body.requiredDegree ?? null,
      minCreditScore: body.minCreditScore ?? 0,
      energyCost: body.energyCost ?? 10,
      openings: body.openings ?? 1,
    });
    res.status(200).json({ ok: true });
  });
}

export async function deleteJob(req: Request, res: Response): Promise<void> {
  ensureAdminRole(req);
  const { id } = req.params as { id: string };
  await withTransaction(async (client) => {
    await educationRepository.deleteJob(client, id);
    res.status(200).json({ ok: true });
  });
}
