import type { Request, Response } from 'express';
import {
  type ProposeMarriageRequest,
  type RespondMarriageProposalRequest,
  type ProposeDivorceRequest,
  type RespondDivorceProposalRequest,
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

  proposeMarriage = async (req: Request, res: Response): Promise<void> => {
    const { spouseCccd, spouseCharacterId, prenupEnabled } = req.body as ProposeMarriageRequest & { spouseCccd?: string };
    const overview = await this.service.proposeMarriage(
      req.actorId!,
      { spouseCccd, spouseCharacterId },
      prenupEnabled ?? false,
    );
    res.status(200).json(overview);
  };

  respondMarriageProposal = async (req: Request, res: Response): Promise<void> => {
    const { proposalId, accept } = req.body as RespondMarriageProposalRequest;
    const overview = await this.service.respondMarriageProposal(req.actorId!, proposalId, accept);
    res.status(200).json(overview);
  };

  proposeDivorce = async (req: Request, res: Response): Promise<void> => {
    const { marriageId, custodyTerms } = req.body as ProposeDivorceRequest;
    const overview = await this.service.proposeDivorce(req.actorId!, marriageId, custodyTerms);
    res.status(200).json(overview);
  };

  respondDivorceProposal = async (req: Request, res: Response): Promise<void> => {
    const { proposalId, accept } = req.body as RespondDivorceProposalRequest;
    const overview = await this.service.respondDivorceProposal(req.actorId!, proposalId, accept);
    res.status(200).json(overview);
  };

  // Aliases (compat): now create proposals requiring consent
  marry = this.proposeMarriage;
  divorce = this.proposeDivorce;

  upsertWill = async (req: Request, res: Response): Promise<void> => {
    const { heirs, primaryHeirId, trustFundEnabled } = req.body as CreateWillRequest;
    const will = await this.service.upsertWill(req.actorId!, {
      heirs,
      primaryHeirId: primaryHeirId ?? null,
      trustFundEnabled,
    });
    res.status(200).json(will);
  };

  depositTrustFund = async (req: Request, res: Response): Promise<void> => {
    const { amount, beneficiaries } = req.body as TrustFundDepositRequest & { beneficiaries?: any[] };
    const overview = await this.service.depositTrustFund(req.actorId!, amount.amount, beneficiaries);
    res.status(200).json(overview);
  };
}

export const socialController = new SocialController();
