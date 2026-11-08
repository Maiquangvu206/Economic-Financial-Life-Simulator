import type { Request, Response } from 'express';
import type { CreateCharacterRequest } from '@efls/contracts';
import { requireActorId } from '../../shared/http/actor.js';
import { CharactersService } from './characters.service.js';

export class CharactersController {
  constructor(private readonly service: CharactersService = new CharactersService()) {}

  getMe = async (req: Request, res: Response): Promise<void> => {
    const actorId = requireActorId(req);
    const character = await this.service.getMe(actorId);
    res.json(character);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    requireActorId(req);
    res.json(await this.service.getById(req.params.id as string));
  };

  listProvinces = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listProvinces());
  };

  resolveByCccd = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.service.resolveByCccd(req.params.cccd as string));
  };

  createProfile = async (req: Request, res: Response): Promise<void> => {
    const actorId = requireActorId(req);
    res.json(await this.service.createProfile(actorId, req.body as CreateCharacterRequest));
  };

  setLocation = async (req: Request, res: Response): Promise<void> => {
    const actorId = requireActorId(req);
    const { x, y } = req.body as { x: number; y: number };
    res.json(await this.service.setLocation(actorId, x, y));
  };
}
