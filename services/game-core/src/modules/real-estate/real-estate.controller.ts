import type { Request, Response } from 'express';
import type { BuyPropertyRequest, ListPropertyRequest, RentPropertyRequest } from '@efls/contracts';
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

  listProperty = async (req: Request, res: Response): Promise<void> => {
    const { propertyId, askingPrice } = req.body as ListPropertyRequest;
    const property = await this.service.listProperty(req.actorId!, propertyId, askingPrice.amount);
    res.status(200).json(property);
  };

  rentProperty = async (req: Request, res: Response): Promise<void> => {
    const { propertyId, monthlyRentMinor } = req.body as RentPropertyRequest;
    const property = await this.service.rentProperty(req.actorId!, propertyId, monthlyRentMinor);
    res.status(200).json(property);
  };
}

export const realEstateController = new RealEstateController();
