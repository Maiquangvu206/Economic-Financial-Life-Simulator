import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import pg from 'pg';
import { SocialService } from './social.service.js';
import { socialRepository } from './social.repository.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://efls:efls@localhost:5433/efls',
  max: 5,
});

const service = new SocialService(socialRepository);

const RUN_ID = Date.now().toString(36);
function uid(n: number) {
  const hex = (Date.now() + n).toString(16).padStart(12, '0').slice(-12);
  return `00000000-0000-4000-9b00-${hex}`;
}
const USER_A = uid(1);
const USER_B = uid(2);
const USER_C = uid(3);
const CHAR_A = uid(11);
const CHAR_B = uid(12);
const CHAR_C = uid(13);
const ACC_A = `9${String(Date.now()).slice(-9)}`;
const ACC_B = `8${String(Date.now()).slice(-9)}`;
const ACC_C = `7${String(Date.now() + 1).slice(-9)}`;

async function exec(sql: string, params: any[] = []) {
  return pool.query(sql, params);
}

async function seed() {
  for (const [u, email, username] of [
    [USER_A, `marry2-a-${RUN_ID}@test.local`, `m2a_${RUN_ID}`],
    [USER_B, `marry2-b-${RUN_ID}@test.local`, `m2b_${RUN_ID}`],
    [USER_C, `marry2-c-${RUN_ID}@test.local`, `m2c_${RUN_ID}`],
  ] as const) {
    await exec(
      `INSERT INTO users (id, email, username, password_hash, role)
       VALUES ($1,$2,$3,'x','player') ON CONFLICT (id) DO NOTHING`,
      [u, email, username],
    );
  }
  // A: 5,000,000 ; B: 3,000,000 để test chia 50/50 khi ly hôn
  for (const [c, u, name, acc, cash] of [
    [CHAR_A, USER_A, `Test A ${RUN_ID}`, ACC_A, 5_000_000],
    [CHAR_B, USER_B, `Test B ${RUN_ID}`, ACC_B, 3_000_000],
    [CHAR_C, USER_C, `Test C ${RUN_ID}`, ACC_C, 2_000_000],
  ] as const) {
    await exec(
      `INSERT INTO characters (id, user_id, full_name, age, health_energy, cash_minor, credit_score, heat_level, marital_status, location_x, location_y, account_number)
       VALUES ($1,$2,$3,25,100,$5,650,0,'single',0,0,$4)
       ON CONFLICT (id) DO UPDATE SET marital_status='single', spouse_id=NULL, cash_minor=EXCLUDED.cash_minor`,
      [c, u, name, acc, cash],
    );
  }
}

async function cleanup() {
  await exec(`DELETE FROM divorce_proposals WHERE marriage_id IN (SELECT id FROM marriage_contracts WHERE character_id IN ($1,$2,$3) OR spouse_id IN ($1,$2,$3))`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`DELETE FROM marriage_proposals WHERE proposer_character_id IN ($1,$2,$3) OR target_character_id IN ($1,$2,$3)`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`DELETE FROM will_heirs WHERE will_id IN (SELECT id FROM wills WHERE character_id IN ($1,$2,$3))`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`DELETE FROM trust_funds WHERE character_id IN ($1,$2,$3)`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`DELETE FROM wills WHERE character_id IN ($1,$2,$3)`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`DELETE FROM marriage_contracts WHERE character_id IN ($1,$2,$3) OR spouse_id IN ($1,$2,$3)`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`DELETE FROM ledger_entries WHERE account_id IN (SELECT id FROM ledger_accounts WHERE owner_type='character' AND owner_id IN ($1,$2,$3))`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`DELETE FROM ledger_accounts WHERE owner_type='character' AND owner_id IN ($1,$2,$3)`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`UPDATE characters SET marital_status='single', spouse_id=NULL WHERE id IN ($1,$2,$3)`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`DELETE FROM characters WHERE id IN ($1,$2,$3)`, [CHAR_A, CHAR_B, CHAR_C]).catch(() => {});
  await exec(`DELETE FROM users WHERE id IN ($1,$2,$3)`, [USER_A, USER_B, USER_C]).catch(() => {});
}

beforeAll(async () => {
  await cleanup();
  await seed();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('Hôn nhân cần đồng thuận 2 bên', () => {
  it('gửi lời cầu hôn tạo proposal (chưa kết hôn ngay)', async () => {
    const overview = await service.proposeMarriage(USER_A, CHAR_B, false);
    expect(overview.maritalStatus).toBe('single');
    expect(overview.marriageProposals.length).toBe(1);
    const p = overview.marriageProposals[0]!;
    expect(p.status).toBe('pending');
    expect(p.proposerCharacterId).toBe(CHAR_A);
    expect(p.targetCharacterId).toBe(CHAR_B);
  });

  it('người được cầu hôn thấy proposal và chấp nhận -> kết hôn', async () => {
    const inbox = await service.getOverview(USER_B);
    const p = inbox.marriageProposals.find((x) => x.status === 'pending')!;
    expect(p).toBeTruthy();
    const after = await service.respondMarriageProposal(USER_B, p.id, true);
    expect(after.maritalStatus).toBe('married');
    expect(after.spouse?.characterId).toBe(CHAR_A);
    expect(after.marriageProposals.some((x) => x.status === 'pending')).toBe(false);
  });

  it('không cho cầu hôn khi một bên đã kết hôn', async () => {
    await expect(service.proposeMarriage(USER_A, CHAR_C, false)).rejects.toMatchObject({ code: 'already_married' });
  });

  it('không cho tự cầu hôn chính mình', async () => {
    await exec(`UPDATE characters SET marital_status='single', spouse_id=NULL WHERE id=$1`, [CHAR_C]).catch(() => {});
    await expect(service.proposeMarriage(USER_C, CHAR_C, false)).rejects.toBeTruthy();
  });
});

describe('Ly hôn cần đồng thuận 2 bên + chia tài sản v1', () => {
  it('gửi yêu cầu ly hôn tạo proposal (chưa ly hôn ngay)', async () => {
    const ov = await service.getOverview(USER_A);
    const active = ov.marriages.find((m) => m.status === 'active')!;
    const after = await service.proposeDivorce(USER_A, active.id);
    expect(after.maritalStatus).toBe('married');
    expect(after.divorceProposals.length).toBe(1);
    expect(after.divorceProposals[0]!.status).toBe('pending');
  });

  it('người còn lại chấp nhận -> ly hôn và chia 50/50 tiền mặt (không prenup)', async () => {
    const inbox = await service.getOverview(USER_B);
    const p = inbox.divorceProposals.find((x) => x.status === 'pending')!;
    expect(p).toBeTruthy();
    const after = await service.respondDivorceProposal(USER_B, p.id, true);
    expect(after.maritalStatus).toBe('divorced');
    expect(after.spouse).toBeNull();
    const b = await service.getOverview(USER_B);
    expect(b.maritalStatus).toBe('divorced');
    // A:5,000,000 + B:3,000,000 = 8,000,000 => mỗi bên 4,000,000
    const ca = await exec(`SELECT cash_minor FROM characters WHERE id=$1`, [CHAR_A]);
    const cb = await exec(`SELECT cash_minor FROM characters WHERE id=$1`, [CHAR_B]);
    expect(Number(ca.rows[0].cash_minor)).toBe(4_000_000);
    expect(Number(cb.rows[0].cash_minor)).toBe(4_000_000);
  });
});

describe('Di chúc (will / heirs)', () => {
  it('lập di chúc nhiều người thừa kế với tỉ lệ % (bao gồm người chơi khác)', async () => {
    const will = await service.upsertWill(USER_A, {
      heirs: [
        { characterId: CHAR_B, sharePct: 60, relationship: 'Con ruột', note: null },
        { characterId: CHAR_C, sharePct: 40, relationship: 'Con riêng', note: 'con riêng' },
      ],
      trustFundEnabled: false,
    });
    expect(will.heirs.length).toBe(2);
    const total = will.heirs.reduce((s, h) => s + h.sharePct, 0);
    expect(total).toBeCloseTo(100, 5);
    const step = will.heirs.find((h) => h.characterId === CHAR_C);
    expect(step?.relationship).toBe('Con riêng');
  });

  it('getOverview trả về heirs và tổng tỉ lệ đúng', async () => {
    const ov = await service.getOverview(USER_A);
    expect(ov.will.heirs.length).toBe(2);
    expect(ov.will.primaryHeirId).toBeTruthy();
  });

  it('không cho tự đặt mình làm người thừa kế', async () => {
    await expect(
      service.upsertWill(USER_A, {
        heirs: [{ characterId: CHAR_A, sharePct: 100, relationship: 'Tự thừa kế' }],
        trustFundEnabled: false,
      }),
    ).rejects.toBeTruthy();
  });

  it('không cho tổng tỉ lệ vượt quá 100%', async () => {
    await expect(
      service.upsertWill(USER_A, {
        heirs: [
          { characterId: CHAR_B, sharePct: 70, relationship: 'Con ruột' },
          { characterId: CHAR_C, sharePct: 40, relationship: 'Con riêng' },
        ],
        trustFundEnabled: false,
      }),
    ).rejects.toBeTruthy();
  });

  it('bật quỹ tín thác khi lưu di chúc tạo quỹ', async () => {
    const will = await service.upsertWill(USER_A, {
      heirs: [{ characterId: CHAR_B, sharePct: 100, relationship: 'Con ruột' }],
      trustFundEnabled: true,
    });
    expect(will.trustFundEnabled).toBe(true);
    const ov = await service.getOverview(USER_A);
    expect(ov.trustFunds.length).toBeGreaterThanOrEqual(1);
  });
});
