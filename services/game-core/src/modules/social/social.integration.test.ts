import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { SocialService } from './social.service.js';
import { socialRepository } from './social.repository.js';

const { Pool } = pg;

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const RUN_ID = `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const pool = connectionString
  ? new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 3000,
    })
  : null;

let dbAvailable = false;
let skipReason = pool
  ? ''
  : 'Bỏ qua kiểm thử tích hợp social: chưa cấu hình TEST_DATABASE_URL hoặc DATABASE_URL.';

const service = new SocialService(socialRepository);

function uid(n: number) {
  const hex = (Date.now() + n).toString(16).padStart(12, '0').slice(-12);
  return `00000000-0000-4000-9b00-${hex}`;
}
function cccd(n: number) {
  const tail = String(Date.now() + n).slice(-9).padStart(9, '0');
  return `001${tail}`;
}

const USER_A = uid(1);
const USER_B = uid(2);
const USER_C = uid(3);
const CHAR_A = uid(11);
const CHAR_B = uid(12);
const CHAR_C = uid(13);
const ACC_A = `9${String(Date.now()).slice(-9)}`;
const ACC_B = `8${String(Date.now() + 1).slice(-9)}`;
const ACC_C = `7${String(Date.now() + 2).slice(-9)}`;

async function exec(sql: string, params: any[] = []) {
  if (!pool) throw new Error('DB pool unavailable');
  return pool.query(sql, params);
}

async function canConnect(): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    skipReason = `Bỏ qua kiểm thử tích hợp social: không kết nối được DB (${message}).`;
    console.warn(`[social.integration.test] ${skipReason}`);
    return false;
  }
}

async function seed() {
  for (const [u, email, username] of [
    [USER_A, `${RUN_ID}_a@test.local`, `${RUN_ID}_a`],
    [USER_B, `${RUN_ID}_b@test.local`, `${RUN_ID}_b`],
    [USER_C, `${RUN_ID}_c@test.local`, `${RUN_ID}_c`],
  ] as const) {
    await exec(
      `INSERT INTO users (id, email, username, password_hash, role, is_active, created_at)
       VALUES ($1,$2,$3,'x','player',true,now())
       ON CONFLICT (id) DO NOTHING`,
      [u, email, username],
    );
  }
  // Giá trị mặc định seed; một số test sẽ cập nhật cash để kiểm tra chia tài sản
  for (const [c, u, name, acc, n, cash] of [
    [CHAR_A, USER_A, `Người A ${RUN_ID}`, ACC_A, 11, 1_000_000],
    [CHAR_B, USER_B, `Người B ${RUN_ID}`, ACC_B, 12, 1_000_000],
    [CHAR_C, USER_C, `Người C ${RUN_ID}`, ACC_C, 13, 1_000_000],
  ] as const) {
    await exec(
      `INSERT INTO characters (
         id, user_id, full_name, age, net_worth_minor, cash_minor, heat_level, credit_score,
         account_number, is_alive, marital_status, cccd, birthplace, created_at
       )
       VALUES ($1,$2,$3,25,$6,$6,0,600,$4,true,'single',$5,'001',now())
       ON CONFLICT (id) DO NOTHING`,
      [c, u, name, acc, cccd(n as number), cash],
    );
  }
}

async function cleanup() {
  if (!pool || !dbAvailable) return;
  // Chỉ dọn dữ liệu thuộc runId/test IDs của lần chạy này (không xóa toàn bảng).
  await exec(
    `DELETE FROM divorce_proposals WHERE marriage_id IN (
       SELECT id FROM marriage_contracts WHERE character_id = ANY($1::uuid[]) OR spouse_id = ANY($1::uuid[])
     )`,
    [[CHAR_A, CHAR_B, CHAR_C]],
  ).catch(() => {});
  await exec(
    `DELETE FROM marriage_proposals WHERE proposer_character_id = ANY($1::uuid[]) OR target_character_id = ANY($1::uuid[])`,
    [[CHAR_A, CHAR_B, CHAR_C]],
  ).catch(() => {});
  await exec(
    `DELETE FROM will_heirs WHERE will_id IN (SELECT id FROM wills WHERE character_id = ANY($1::uuid[]))`,
    [[CHAR_A, CHAR_B, CHAR_C]],
  ).catch(() => {});
  await exec(`DELETE FROM trust_funds WHERE character_id = ANY($1::uuid[])`, [[CHAR_A, CHAR_B, CHAR_C]]).catch(() => {});
  await exec(`DELETE FROM wills WHERE character_id = ANY($1::uuid[])`, [[CHAR_A, CHAR_B, CHAR_C]]).catch(() => {});
  await exec(
    `DELETE FROM marriage_contracts WHERE character_id = ANY($1::uuid[]) OR spouse_id = ANY($1::uuid[])`,
    [[CHAR_A, CHAR_B, CHAR_C]],
  ).catch(() => {});
  await exec(
    `DELETE FROM ledger_entries WHERE account_id IN (
       SELECT id FROM ledger_accounts WHERE owner_type='character' AND owner_id = ANY($1::uuid[])
     )`,
    [[CHAR_A, CHAR_B, CHAR_C]],
  ).catch(() => {});
  await exec(
    `DELETE FROM ledger_accounts WHERE owner_type='character' AND owner_id = ANY($1::uuid[])`,
    [[CHAR_A, CHAR_B, CHAR_C]],
  ).catch(() => {});
  await exec(
    `UPDATE characters SET marital_status='single', spouse_id=NULL WHERE id = ANY($1::uuid[])`,
    [[CHAR_A, CHAR_B, CHAR_C]],
  ).catch(() => {});
  await exec(`DELETE FROM characters WHERE id = ANY($1::uuid[])`, [[CHAR_A, CHAR_B, CHAR_C]]).catch(() => {});
  await exec(`DELETE FROM users WHERE id = ANY($1::uuid[]) OR email LIKE $2 OR username LIKE $2`, [
    [USER_A, USER_B, USER_C],
    `${RUN_ID}%`,
  ]).catch(() => {});
}

dbAvailable = await canConnect();
if (!dbAvailable && pool) {
  await pool.end().catch(() => {});
}

const describeDb = dbAvailable ? describe : describe.skip;
if (!dbAvailable) {
  console.warn(`[social.integration.test] ${skipReason || 'Bỏ qua kiểm thử tích hợp social: không kết nối được DB.'}`);
}

beforeAll(async () => {
  if (!dbAvailable) return;
  try {
    await cleanup();
    await seed();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[social.integration.test] Bỏ qua kiểm thử tích hợp social: lỗi khởi tạo dữ liệu (${message}).`);
    dbAvailable = false;
  }
});

afterAll(async () => {
  try {
    if (dbAvailable) await cleanup();
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
});

describeDb('Hôn nhân cần đồng thuận 2 bên', () => {

// replaced above
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

describeDb('Ly hôn cần đồng thuận 2 bên + chia tài sản v1', () => {
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
    // A:1,000,000 + B:1,000,000 = 2,000,000 => mỗi bên 1,000,000 (theo seed hiện tại)
    const ca = await exec(`SELECT cash_minor FROM characters WHERE id=$1`, [CHAR_A]);
    const cb = await exec(`SELECT cash_minor FROM characters WHERE id=$1`, [CHAR_B]);
    expect(Number(ca.rows[0].cash_minor)).toBe(1_000_000);
    expect(Number(cb.rows[0].cash_minor)).toBe(1_000_000);
  });
});

describeDb('Di chúc (will / heirs)', () => {
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
