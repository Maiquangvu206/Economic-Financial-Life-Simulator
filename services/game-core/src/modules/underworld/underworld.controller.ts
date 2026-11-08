import type { Request, Response } from 'express';
import {
  type BuyCredentialRequest,
  type BuyProtectionRequest,
  type CollectEvidenceRequest,
  type CommitCrimeRequest,
  type SellEvidenceRequest,
  type StartBlackmailRequest,
  type StartStingRequest,
  type SubmitEvidenceUnderworldRequest,
} from '@efls/contracts';
import { UnderworldService } from './underworld.service.js';

export class UnderworldController {
  constructor(private readonly service: UnderworldService = new UnderworldService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.service.getOverview(req.actorId!);
    res.status(200).json(overview);
  };

  commitCrime = async (req: Request, res: Response): Promise<void> => {
    const { crimeType } = req.body as CommitCrimeRequest;
    const result = await this.service.commitCrime(req.actorId!, crimeType);
    res.status(200).json(result);
  };

  buyCredential = async (req: Request, res: Response): Promise<void> => {
    const { kind } = req.body as BuyCredentialRequest;
    const overview = await this.service.buyCredential(req.actorId!, kind);
    res.status(200).json(overview);
  };

  collectEvidence = async (req: Request, res: Response): Promise<void> => {
    const { targetCharacterId, price } = req.body as CollectEvidenceRequest;
    const overview = await this.service.collectEvidence(
      req.actorId!,
      targetCharacterId,
      price.amount,
    );
    res.status(200).json(overview);
  };

  sellEvidence = async (req: Request, res: Response): Promise<void> => {
    const { evidenceId } = req.body as SellEvidenceRequest;
    const overview = await this.service.sellEvidence(req.actorId!, evidenceId);
    res.status(200).json(overview);
  };

  submitEvidence = async (req: Request, res: Response): Promise<void> => {
    const { evidenceId } = req.body as SubmitEvidenceUnderworldRequest;
    const overview = await this.service.submitEvidence(req.actorId!, evidenceId);
    res.status(200).json(overview);
  };

  startBlackmail = async (req: Request, res: Response): Promise<void> => {
    const { targetCharacterId, monthlyPayment } = req.body as StartBlackmailRequest;
    const overview = await this.service.startBlackmail(
      req.actorId!,
      targetCharacterId,
      monthlyPayment.amount,
    );
    res.status(200).json(overview);
  };

  collectBlackmail = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.service.collectBlackmail(req.actorId!, req.params.id as string);
    res.status(200).json(overview);
  };

  startSting = async (req: Request, res: Response): Promise<void> => {
    const { targetCharacterId, amount } = req.body as StartStingRequest;
    const overview = await this.service.startSting(req.actorId!, targetCharacterId, amount.amount);
    res.status(200).json(overview);
  };

  buyProtection = async (req: Request, res: Response): Promise<void> => {
    const { kind } = req.body as BuyProtectionRequest;
    const overview = await this.service.buyProtection(req.actorId!, kind);
    res.status(200).json(overview);
  };

  triggerSweep = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.service.triggerSweep(req.actorId!);
    res.status(200).json(overview);
  };
}

export const underworldController = new UnderworldController();
