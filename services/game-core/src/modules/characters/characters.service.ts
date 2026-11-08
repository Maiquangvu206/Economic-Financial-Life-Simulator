import type { CharacterDto } from '@efls/contracts';
import { AppError } from '../../shared/http/errors.js';
import { CharactersRepository, type CharacterRow } from './characters.repository.js';

function toDto(row: CharacterRow): CharacterDto {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    age: row.age,
    healthEnergy: row.health_energy,
    creditScore: row.credit_score,
    heatLevel: row.heat_level,
    maritalStatus: row.marital_status,
    spouseId: row.spouse_id,
    location: { x: row.location_x, y: row.location_y },
    // TODO: replace with the real asset/liability balance from the finance module.
    netWorth: { amount: Number(row.cash_minor), currency: 'VND' },
    createdAt: row.created_at.toISOString(),
  };
}

export class CharactersService {
  constructor(private readonly repository: CharactersRepository = new CharactersRepository()) {}

  async getMe(userId: string): Promise<CharacterDto> {
    const character = await this.repository.findByUserId(userId);
    if (!character) {
      throw AppError.notFound('Character');
    }
    return toDto(character);
  }
}
