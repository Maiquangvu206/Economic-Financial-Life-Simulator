import type { Request, Response } from 'express';
import type { ConstructPropertyRequest, DemolishPropertyRequest } from '@efls/contracts';
import { provinceLandService } from './provinceLand.service.js';

export class ProvinceLandController {
  listByProvince = async (req: Request, res: Response): Promise<void> => {
    const provinceCode = String(req.query.province ?? req.query.provinceCode ?? '001');
    const items = await provinceLandService.listByProvince(req.actorId!, provinceCode);
    res.status(200).json({ provinceCode, properties: items });
  };

  construct = async (req: Request, res: Response): Promise<void> => {
    const { propertyId, optionId, memberPropertyIds, constructionName } = req.body as ConstructPropertyRequest;
    const provinceCode = String(req.query.province ?? req.body?.provinceCode ?? '001');
    const properties = await provinceLandService.construct(
      req.actorId!,
      propertyId,
      optionId,
      memberPropertyIds ?? [],
      constructionName,
    );
    res.status(200).json({ provinceCode, properties });
  };

  demolish = async (req: Request, res: Response): Promise<void> => {
    const { propertyId } = req.body as DemolishPropertyRequest;
    const provinceCode = String(req.query.province ?? (req.body as any)?.provinceCode ?? '001');
    const properties = await provinceLandService.demolish(req.actorId!, provinceCode, propertyId);
    res.status(200).json({ provinceCode, properties });
  };

  makeOffer = async (req: Request, res: Response): Promise<void> => {
    const provinceCode = String(req.query.province ?? req.body?.provinceCode ?? '001');
    const body = req.body as { propertyId: string; amount?: { amount?: number } | number; message?: string };
    const amountMinor = typeof body.amount === 'number' ? body.amount : Number(body.amount?.amount ?? 0);
    const offer = await provinceLandService.makeOffer(req.actorId!, provinceCode, body.propertyId, Math.round(amountMinor), body.message);
    res.status(201).json(offer);
  };

  respondOffer = async (req: Request, res: Response): Promise<void> => {
    const provinceCode = String(req.query.province ?? req.body?.provinceCode ?? '001');
    const body = req.body as { offerId: string; action: 'accept' | 'reject' | 'cancel' };
    const properties = await provinceLandService.respondOffer(req.actorId!, provinceCode, body.offerId, body.action);
    res.status(200).json({ provinceCode, properties });
  };
}

export const provinceLandController = new ProvinceLandController();
