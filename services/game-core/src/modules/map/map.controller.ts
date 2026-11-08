import type { Request, Response } from 'express';
import type { PutMapRequest } from '@efls/contracts';
import { MapService } from './map.service.js';

export class MapController {
  constructor(private readonly service: MapService = new MapService()) {}

  getMap = async (req: Request, res: Response): Promise<void> => {
    const province = req.query.province as string | undefined;
    const mapData = await this.service.getMap(province);
    res.status(200).json(mapData);
  };

  putMap = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as PutMapRequest;
    const result = await this.service.putMap(req.actorId, req.actorRole, input);
    res.status(200).json(result);
  };
}

export const mapController = new MapController();
