import type { Request, Response } from 'express';
import type { ConstructPropertyRequest } from '@efls/contracts';
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
}

export const provinceLandController = new ProvinceLandController();
