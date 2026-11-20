import type { Request, Response } from 'express';
import { requireActorId } from '../../shared/http/actor.js';
import { SuccessionService } from './succession.service.js';

export class SuccessionController {
  constructor(private readonly service = new SuccessionService()) {}

  eligibleSuccessors = async (req: Request, res: Response) => {
    const userId = requireActorId(req);
    res.json(await this.service.getEligibleSuccessors(userId));
  };

  execute = async (req: Request, res: Response) => {
    const userId = requireActorId(req);
    const { successorId, newCharacterFullName, newCharacterBirthplaceCode } = (req.body ?? {}) as {
      successorId?: string | null;
      newCharacterFullName?: string | null;
      newCharacterBirthplaceCode?: string | null;
    };
    const result = await this.service.executeSuccession(
      userId,
      successorId ?? null,
      newCharacterFullName ?? null,
      newCharacterBirthplaceCode ?? null,
    );
    res.json(result);
  };

  triggerDeath = async (req: Request, res: Response) => {
    // admin/system debug endpoint or internal trigger helper
    const { characterId } = req.body as { characterId: string };
    res.json(await this.service.checkAndTriggerDeath(characterId));
  };
}
