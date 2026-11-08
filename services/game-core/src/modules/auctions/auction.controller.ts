import type { Request, Response } from 'express';
import type { CancelAuctionRequest, CreateAuctionRequest, PlaceBidRequest } from '@efls/contracts';
import { requireActorId } from '../../shared/http/actor.js';
import { AuctionService } from './auction.service.js';

export class AuctionController {
  constructor(private readonly service: AuctionService = new AuctionService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const overview = await this.service.getOverview(userId);
    res.status(200).json(overview);
  };

  getAuction = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { auctionId } = req.params as { auctionId: string };
    const auction = await this.service.getAuction(userId, auctionId);
    res.status(200).json(auction);
  };

  placeBid = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { auctionId, amount } = req.body as PlaceBidRequest;
    const auction = await this.service.placeBid(userId, auctionId, amount.amount);
    res.status(200).json(auction);
  };

  endAuction = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { auctionId } = req.params as { auctionId: string };
    const auction = await this.service.endAuction(userId, auctionId);
    res.status(200).json(auction);
  };

  cancelAuction = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { auctionId } = req.body as CancelAuctionRequest;
    await this.service.cancelAuction(userId, auctionId);
    res.status(204).end();
  };

  createAuction = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { propertyId, startingPrice, endsAt } = req.body as CreateAuctionRequest;
    await this.service.createAuction(userId, propertyId, startingPrice.amount, new Date(endsAt));
    res.status(201).json({ ok: true });
  };
}

export const auctionController = new AuctionController();
