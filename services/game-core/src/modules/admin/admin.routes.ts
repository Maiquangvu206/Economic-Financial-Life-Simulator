import { Router } from 'express';
import type { MacroSnapshotDto } from '@efls/contracts';
import type { Request, Response } from 'express';
import { AppError } from '../../shared/http/errors.js';

export const adminRouter: Router = Router();

function ensureAdmin(req: Request): void {
  if (req.actorRole !== 'admin' && req.actorRole !== 'moderator') {
    throw AppError.forbidden('Admin role required');
  }
}

adminRouter.get('/macro/snapshot', (req, res: Response) => {
  ensureAdmin(req);
  const snapshot: MacroSnapshotDto = {
    tick: 0,
    inGameYear: 1,
    moneySupply: { amount: 0, currency: 'USD' },
    inflationPct: 0,
    cpi: 100,
    marketCap: { amount: 0, currency: 'USD' },
    concurrentUsers: 0,
    activeCourtCases: 0,
    generatedAt: new Date().toISOString(),
  };
  res.json(snapshot);
});

adminRouter.post('/players/:id/actions', (req, res: Response) => {
  ensureAdmin(req);
  res.status(501).json({
    type: 'https://efls.game/errors/not-implemented',
    title: 'Player intervention is not implemented yet',
    status: 501,
    detail: 'Wire this action to the audit log and the player-management module first.',
  });
});
