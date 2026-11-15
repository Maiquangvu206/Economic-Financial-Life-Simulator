import type { Request, Response } from 'express';
import type {
  BuyLandRequest,
  BuyPropertyRequest,
  ConstructPropertyRequest,
  ListPropertyRequest,
  MakePropertyOfferRequest,
  RentPropertyRequest,
  RespondPropertyOfferRequest,
  UnlistPropertyRequest,
  UpdateRentTermsRequest,
} from '@efls/contracts';
import { RealEstateService } from './real-estate.service.js';

export class RealEstateController {
  constructor(private readonly service: RealEstateService = new RealEstateService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.service.getOverview(req.actorId!);
    res.status(200).json(overview);
  };

  buyProperty = async (req: Request, res: Response): Promise<void> => {
    const { propertyId } = req.body as BuyPropertyRequest;
    const property = await this.service.buyProperty(req.actorId!, propertyId);
    res.status(200).json(property);
  };

  buyLand = async (req: Request, res: Response): Promise<void> => {
    const { x, y } = req.body as BuyLandRequest;
    const property = await this.service.buyLand(req.actorId!, x, y);
    res.status(200).json(property);
  };

  listProperty = async (req: Request, res: Response): Promise<void> => {
    const { propertyId, askingPrice, saleNotes } = req.body as ListPropertyRequest;
    const property = await this.service.listProperty(req.actorId!, propertyId, askingPrice.amount, saleNotes);
    res.status(200).json(property);
  };

  unlistProperty = async (req: Request, res: Response): Promise<void> => {
    const { propertyId } = req.body as { propertyId: string };
    const property = await this.service.unlistProperty(req.actorId!, propertyId);
    res.status(200).json(property);
  };

  updateRentTerms = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as UpdateRentTermsRequest;
    const property = await this.service.updateRentTerms(req.actorId!, body.propertyId, {
      monthlyRentMinor: body.monthlyRentMinor,
      rentDepositMinor: body.rentDepositMinor ?? 0,
      rentListingActive: body.rentListingActive,
      rentNotes: body.rentNotes ?? null,
    });
    res.status(200).json(property);
  };

  rentProperty = async (req: Request, res: Response): Promise<void> => {
    const { propertyId } = req.body as RentPropertyRequest;
    const property = await this.service.rentProperty(req.actorId!, propertyId);
    res.status(200).json(property);
  };

  makeOffer = async (req: Request, res: Response): Promise<void> => {
    const { propertyId, amount, message } = req.body as MakePropertyOfferRequest;
    const offer = await this.service.makeOffer(req.actorId!, propertyId, amount.amount, message);
    res.status(201).json(offer);
  };

  respondOffer = async (req: Request, res: Response): Promise<void> => {
    const { offerId, action } = req.body as RespondPropertyOfferRequest;
    const property = await this.service.respondOffer(req.actorId!, offerId, action);
    res.status(200).json(property);
  };

  constructProperty = async (req: Request, res: Response): Promise<void> => {
    const { propertyId, optionId, memberPropertyIds, constructionName } = req.body as ConstructPropertyRequest;
    const overview = await this.service.constructProperty(req.actorId!, propertyId, optionId, memberPropertyIds ?? [], constructionName);
    res.status(200).json(overview);
  };
}

export const realEstateController = new RealEstateController();
