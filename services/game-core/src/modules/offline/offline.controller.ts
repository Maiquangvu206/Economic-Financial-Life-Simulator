import type { Request, Response } from 'express';
import { UpdateOfflinePlayerSettingsRequestSchema, UpdateOfflinePolicyRequestSchema } from '@efls/contracts';
import { AppError } from '../../shared/http/errors.js';
import { offlineService } from './offline.service.js';

function ensureAdmin(req: Request): void {
  if (req.actorRole !== 'admin' && req.actorRole !== 'moderator') {
    throw AppError.forbidden('Admin role required');
  }
}

export class OfflineController {
  getSettings = async (req: Request, res: Response) => {
    if (!req.actorId) throw AppError.unauthorized();
    const settings = await offlineService.getSettings(req.actorId);
    res.json(settings);
  };

  updateSettings = async (req: Request, res: Response) => {
    if (!req.actorId) throw AppError.unauthorized();
    const body = UpdateOfflinePlayerSettingsRequestSchema.parse(req.body);
    const settings = await offlineService.updateSettings(req.actorId, body);
    res.json(settings);
  };

  getRecap = async (req: Request, res: Response) => {
    if (!req.actorId) throw AppError.unauthorized();
    const recap = await offlineService.getLatestRecap(req.actorId);
    res.json(recap);
  };

  process = async (req: Request, res: Response) => {
    if (!req.actorId) throw AppError.unauthorized();
    const result = await offlineService.processForUser(req.actorId);
    res.json(result);
  };

  getPolicy = async (req: Request, res: Response) => {
    ensureAdmin(req);
    const policy = await offlineService.getPolicy();
    res.json(policy);
  };

  updatePolicy = async (req: Request, res: Response) => {
    ensureAdmin(req);
    const body = UpdateOfflinePolicyRequestSchema.parse(req.body);
    const policy = await offlineService.updatePolicy(body, req.actorId ?? null);
    res.json(policy);
  };
}

export const offlineController = new OfflineController();
