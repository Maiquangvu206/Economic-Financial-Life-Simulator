import type { Request, Response } from 'express';
import {
  type DivorceRequest,
  type MarryRequest,
  type CreateWillRequest,
  type TrustFundDepositRequest,
} from '@efls/contracts';
import { SocialService } from './social.service.js';

export class SocialController {
  constructor(private readonly service: SocialService = new SocialService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.service.getOverview(req.actorId!);
    res.status(200).json(overview);
  };

  marry = async (req: Request, res: Response): Promise<void> => {
    const { spouseCharacterId, prenupEnabled } = req.body as MarryRequest;
    const overview = await this.service.marry(
      req.actorId!,
      spouseCharacterId,
      prenupEnabled ?? false,
    );
    res.status(200).json(overview);
  };

  divorce = async (req: Request, res: Response): Promise<void> => {
    const { marriageId } = req.body as DivorceRequest;
    const overview = await this.service.divorce(req.actorId!, marriageId);
    res.status(200).json(overview);
  };

  upsertWill = async (req: Request, res: Response): Promise<void> => {
    const { primaryHeirId, trustFundEnabled } = req.body as CreateWillRequest;
    const will = await this.service.upsertWill(
      req.actorId!,
      primaryHeirId ?? null,
      trustFundEnabled,
    );
    res.status(200).json(will);
  };

  depositTrustFund = async (req: Request, res: Response): Promise<void> => {
    const { amount } = req.body as TrustFundDepositRequest;
    const overview = await this.service.depositTrustFund(req.actorId!, amount.amount);
    res.status(200).json(overview);
  };
}

export const socialController = new SocialController();
