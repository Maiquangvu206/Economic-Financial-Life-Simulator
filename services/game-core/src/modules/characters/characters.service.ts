import { generateCccd, provinceByCode, PROVINCES_34 } from '@efls/domain';
import type { CharacterDto, ProvinceDto, CreateCharacterRequest } from '@efls/contracts';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import {
  CharactersRepository,
  type CharacterRow,
  type ProvinceRow,
} from './characters.repository.js';

function toDto(row: CharacterRow): CharacterDto {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    cccd: row.cccd,
    birthplace: row.birthplace,
    birthplaceName: row.birthplace_name,
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

function toProvinceDto(row: ProvinceRow): ProvinceDto {
  return {
    code: row.code,
    name: row.name,
    region: row.region as 'Bắc' | 'Trung' | 'Nam',
    isCity: row.is_city,
  };
}

/** Vị trí trên map 32x20 theo chỉ số tỉnh trong danh sách 34 tỉnh (0..33). */
function provinceAnchor(code: string): { x: number; y: number } {
  const index = PROVINCES_34.findIndex((p) => p.code === code);
  const safeIndex = index >= 0 ? index : 0;
  return { x: (safeIndex % 16) * 2, y: Math.floor(safeIndex / 16) * 6 + 2 };
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

  async listProvinces(): Promise<ProvinceDto[]> {
    return (await this.repository.listProvinces()).map(toProvinceDto);
  }

  async resolveByCccd(cccd: string): Promise<{ id: string; fullName: string }> {
    if (!/^\d{12}$/.test(cccd)) throw AppError.badRequest('CCCD phải là 12 chữ số.');
    const row = await this.repository.findByCccd(cccd);
    if (!row) throw AppError.notFound('Character');
    return { id: row.id, fullName: row.full_name };
  }

  async getById(characterId: string): Promise<CharacterDto> {
    const row = await this.repository.findById(characterId);
    if (!row) throw AppError.notFound('Character');
    return toDto(row);
  }

  /** Di chuyển nơi ở hiện tại (không đổi nơi sinh / CCCD cố định). */
  async setLocation(userId: string, x: number, y: number): Promise<CharacterDto> {
    const row = await this.repository.findByUserId(userId);
    if (!row) throw AppError.notFound('Character');
    const updated = await this.repository.setLocation(row.id, x, y);
    if (!updated) throw new Error('Character disappeared during move');
    updated.birthplace_name = row.birthplace_name;
    return toDto(updated);
  }

  async createProfile(userId: string, input: CreateCharacterRequest): Promise<CharacterDto> {
    return withTransaction(async (client) => {
      const existing = await this.repository.findByUserId(userId);
      if (existing) {
        // Hồ sơ chỉ tạo một lần (đăng ký / sinh con) — không cho tạo trùng.
        throw AppError.conflict('profile_exists', 'Nhân vật đã có hồ sơ.');
      }
      const birthplaceCode = input.birthplaceCode ?? '001';
      const province = provinceByCode(birthplaceCode);
      if (!province) throw AppError.badRequest('Mã tỉnh không hợp lệ.');
      const anchor = provinceAnchor(birthplaceCode);
      const cccd = await this.uniqueCccd(client, birthplaceCode);
      const created = await this.repository.createCharacter(client, {
        userId,
        fullName: input.fullName,
        cccd,
        birthplace: birthplaceCode,
        locationX: anchor.x,
        locationY: anchor.y,
      });
      created.birthplace_name = province.name;
      return toDto(created);
    });
  }

  // Hồ sơ (tên + nơi sinh + CCCD) chỉ được xác định một lần lúc đăng ký
  // hoặc khi sinh con mới — không sửa sau đó (xem createProfile).

  private async uniqueCccd(
    client: Parameters<CharactersRepository['getProvince']>[1],
    birthplaceCode: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = generateCccd(birthplaceCode);
      const exists = await this.repository.cccdExists(candidate, client);
      if (!exists) return candidate;
    }
    throw AppError.conflict('cccd_exhausted', 'Không sinh được CCCD duy nhất.');
  }
}
