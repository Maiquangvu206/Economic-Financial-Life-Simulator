import type { Request, Response } from 'express';
import { requireActorId } from '../../shared/http/actor.js';
import { CharactersService } from './characters.service.js';

export class CharactersController {
  constructor(private readonly service: CharactersService = new CharactersService()) {}

  getMe = async (req: Request, res: Response): Promise<void> => {
    const actorId = requireActorId(req);
    const character = await this.service.getMe(actorId);
    res.json(character);
  };
}
