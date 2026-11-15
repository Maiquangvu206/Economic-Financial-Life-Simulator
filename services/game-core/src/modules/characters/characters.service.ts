import { generateCccd, provinceByCode, PROVINCES_34, maskCccd } from '@efls/domain';
import type { AccountTier, CharacterDto, ProvinceDto, CreateCharacterRequest, ResolveCccdResponse, EligibleSuccessorDto } from '@efls/contracts';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { generateAccountNumber, resolveAccountTier } from '../../shared/banking/accountTier.js';
import {
  CharactersRepository,
  type CharacterRow,
  type ProvinceRow,
} from './characters.repository.js';

function toDto(row: CharacterRow, tier: AccountTier, netWorthMinor?: number): CharacterDto {
  const cashMinor = Number(row.cash_minor ?? 0);
  return {
    id: row.id,
    userId: row.user_id!,
    fullName: row.full_name,
    accountNumber: row.account_number,
    accountTier: tier,
    cccd: row.cccd,
    birthplace: row.birthplace,
    birthplaceName: row.birthplace_name,
    age: row.age,
    healthEnergy: row.health_energy,
    creditScore: row.credit_score,
    heatLevel: row.heat_level,
    isAlive: row.is_alive,
    maritalStatus: row.marital_status,
    spouseId: row.spouse_id,
    location: { x: row.location_x, y: row.location_y },
    cash: { amount: cashMinor, currency: 'VND' },
    netWorth: { amount: netWorthMinor ?? cashMinor, currency: 'VND' },
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

function provinceAnchor(code: string): { x: number; y: number } {
  const index = PROVINCES_34.findIndex((p) => p.code === code);
  const safeIndex = index >= 0 ? index : 0;
  return { x: (safeIndex % 16) * 2, y: Math.floor(safeIndex / 16) * 6 + 2 };
}

export class CharactersService {
  constructor(private readonly repository: CharactersRepository = new CharactersRepository()) {}

  private async toDtoWithTier(row: CharacterRow): Promise<CharacterDto> {
    const netWorth = await this.repository.getNetWorthMinor(row.id);
    return toDto(row, resolveAccountTier(netWorth), netWorth);
  }

  async getMe(userId: string): Promise<CharacterDto> {
    // Trả về cả nhân vật đã chết để client hiển thị DeathSuccessionModal
    const character = await this.repository.findAnyByUserId(userId);
    if (!character) {
      throw AppError.notFound('Character');
    }
    return this.toDtoWithTier(character);
  }

  async listProvinces(): Promise<ProvinceDto[]> {
    return (await this.repository.listProvinces()).map(toProvinceDto);
  }

  async resolveByCccd(cccd: string): Promise<ResolveCccdResponse> {
    const normalized = (cccd || '').trim();
    if (!/^\d{12}$/.test(normalized)) throw AppError.badRequest('CCCD phải là 12 chữ số.');
    const row = await this.repository.findByCccd(normalized);
    if (!row) throw AppError.notFound('Character');
    return {
      cccd_masked: maskCccd(normalized),
      full_name: row.full_name,
      is_alive: row.is_alive,
    };
  }

  async getById(characterId: string): Promise<CharacterDto> {
    const row = await this.repository.findById(characterId);
    if (!row) throw AppError.notFound('Character');
    return this.toDtoWithTier(row);
  }

  async lookupByAccountNumber(accountNumber: string): Promise<{
    accountNumber: string;
    characterId: string;
    fullName: string;
    accountTier: AccountTier;
  }> {
    const normalized = accountNumber.replace(/\s+/g, '');
    const row = await this.repository.findByAccountNumber(normalized);
    if (!row) throw AppError.notFound('Tài khoản (STK)');
    const netWorth = await this.repository.getNetWorthMinor(row.id);
    return {
      accountNumber: row.account_number,
      characterId: row.id,
      fullName: row.full_name,
      accountTier: resolveAccountTier(netWorth),
    };
  }

  async setLocation(userId: string, x: number, y: number): Promise<CharacterDto> {
    const row = await this.repository.findByUserId(userId);
    if (!row) throw AppError.notFound('Character');
    const updated = await this.repository.setLocation(row.id, x, y);
    if (!updated) throw new Error('Character disappeared during move');
    updated.birthplace_name = row.birthplace_name;
    return this.toDtoWithTier(updated);
  }

  async createProfile(userId: string, input: CreateCharacterRequest): Promise<CharacterDto> {
    return withTransaction(async (client) => {
      const existing = await this.repository.findByUserId(userId);
      if (existing) {
        throw AppError.conflict('profile_exists', 'Nhân vật đã có hồ sơ.');
      }
      const birthplaceCode = input.birthplaceCode ?? '001';
      const province = provinceByCode(birthplaceCode);
      if (!province) throw AppError.badRequest('Mã tỉnh không hợp lệ.');
      const anchor = provinceAnchor(birthplaceCode);
      const cccd = await this.uniqueCccd(client, birthplaceCode, 18);
      const accountNumber = await this.uniqueAccountNumber(client);
      const created = await this.repository.createCharacter(client, {
        userId,
        fullName: input.fullName,
        cccd,
        birthplace: birthplaceCode,
        locationX: anchor.x,
        locationY: anchor.y,
        accountNumber,
        age: 18,
        cashMinor: 500000,
      });
      created.birthplace_name = province.name;
      return toDto(created, resolveAccountTier(Number(created.cash_minor)), Number(created.cash_minor));
    });
  }

  async eligibleSuccessors(userId: string): Promise<EligibleSuccessorDto[]> {
    const me = await this.repository.findByUserId(userId);
    if (!me) throw AppError.notFound('Character');
    const rows = await this.repository.listEligibleSuccessors(me.id);
    return rows.map((r) => ({ id: r.id, cccd: r.cccd, full_name: r.full_name, age: r.age, relation: r.relation, generation_level: r.generation_level, health_energy: r.health_energy }));
  }

  private async uniqueCccd(
    client: Parameters<CharactersRepository['getProvince']>[1],
    birthplaceCode: string,
    birthAge?: number,
  ): Promise<string> {
    const birthYear = birthAge != null ? (new Date().getUTCFullYear() - birthAge) : undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = generateCccd(birthplaceCode, undefined, birthYear);
      const exists = await this.repository.cccdExists(candidate, client);
      if (!exists) return candidate;
    }
    throw AppError.conflict('cccd_exhausted', 'Không sinh được CCCD duy nhất.');
  }

  private async uniqueAccountNumber(
    client: Parameters<CharactersRepository['getProvince']>[1],
  ): Promise<string> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = generateAccountNumber();
      const exists = await this.repository.accountNumberExists(candidate, client);
      if (!exists) return candidate;
    }
    throw AppError.conflict('account_number_exhausted', 'Không tạo được số tài khoản duy nhất.');
  }
}
