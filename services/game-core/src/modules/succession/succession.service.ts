import crypto from 'node:crypto';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_GOVERNMENT_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import { CharactersRepository } from '../characters/characters.repository.js';
import { generateCccd } from '@efls/domain';

const SYSTEM_SELLER_ID = '00000000-0000-4000-8000-0000000000c1'; // AI/Market Maker character

export class SuccessionService {
  private readonly characters = new CharactersRepository();

  async checkAndTriggerDeath(characterId: string): Promise<{ died: boolean; reason?: string }> {
    return withTransaction(async (client) => {
      const res = await (client as any).query(
        `SELECT id, user_id, age, health_energy, is_alive FROM characters WHERE id = $1 FOR UPDATE`,
        [characterId],
      );
      const c = res.rows[0];
      if (!c || c.is_alive === false) return { died: false };
      let reason: string | null = null;
      if (Number(c.health_energy) <= 0) reason = 'Sức khỏe cạn kiệt';
      else if (Number(c.age) >= 65) {
        // xác suất đột tử tăng dần theo tuổi (hàm mũ đơn giản)
        const p = Math.min(0.95, Math.pow(1.12, Number(c.age) - 65) * 0.02);
        if (Math.random() < p) reason = 'Tuổi cao đột tử';
      }
      if (!reason) return { died: false };
      await client.query(`UPDATE characters SET is_alive = false, health_energy = 0, updated_at = now() WHERE id = $1`, [characterId]);
      // khóa thao tác: is_alive=false sẽ được enforce bởi guard (cần bổ sung ở các luồng)
      if (c.user_id) {
        await notify(client, { userId: c.user_id, kind: 'system', title: 'Nhân vật đã qua đời', body: `Nhân vật của bạn đã qua đời (${reason}). Vui lòng chọn người kế thừa để bắt đầu cuộc đời mới.`, payload: { characterId, reason } });
      }
      return { died: true, reason };
    });
  }

  async getEligibleSuccessors(userId: string) {
    return withTransaction(async (client) => {
      const me = await requireCharacterByUserId(client, userId);
      const rows = await (client as any).query(
        `WITH RECURSIVE descendants AS (
           SELECT ft.character_id, ft.parent_id, ft.generation_level
           FROM family_trees ft
           WHERE ft.parent_id = $1
           UNION ALL
           SELECT ft.character_id, ft.parent_id, ft.generation_level
           FROM family_trees ft
           JOIN descendants d ON ft.parent_id = d.character_id
         )
         SELECT c.id, c.cccd, c.full_name, c.age, c.health_energy, d.generation_level,
                CASE WHEN d.generation_level = 1 THEN 'Con'
                     WHEN d.generation_level = 2 THEN 'Cháu'
                     WHEN d.generation_level = 3 THEN 'Chắt'
                     ELSE 'Hậu duệ' END AS relation
         FROM descendants d
         JOIN characters c ON c.id = d.character_id
         WHERE COALESCE(c.is_alive,true) = true AND c.user_id IS NULL
         ORDER BY d.generation_level ASC, c.age DESC`,
        [me.id],
      );
      return rows.rows;
    });
  }

  /** Thực thi kế thừa & cuộc đời mới (Clean-Slate). */
  async executeSuccession(userId: string, successorId?: string | null) {
    return withTransaction(async (client) => {
      const oldChar = await requireCharacterByUserId(client, userId);
      // chỉ cho phép khi đã chết
      const locked = await (client as any).query(
        `SELECT COALESCE(is_alive,true) AS is_alive FROM characters WHERE id=$1 FOR UPDATE`,
        [oldChar.id],
      );
      if (locked.rows[0]?.is_alive !== false) {
        throw AppError.badRequest('Nhân vật chưa qua đời, không thể thực hiện kế thừa.');
      }

      // idempotent settlement
      let settlementId: string;
      const existing = await (client as any).query(
        `SELECT id, status FROM inheritance_settlements WHERE deceased_character_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [oldChar.id],
      );
      if (existing.rows[0]?.status === 'completed') {
        throw AppError.conflict('succession_completed', 'Kế thừa đã được thực hiện.');
      }
      if (existing.rows[0]) {
        settlementId = existing.rows[0].id;
        await client.query(`UPDATE inheritance_settlements SET status='processing', updated_at=now() WHERE id=$1`, [settlementId]);
      } else {
        const ins = await (client as any).query(
          `INSERT INTO inheritance_settlements (id, deceased_character_id, deceased_cccd, status) VALUES (gen_random_uuid(), $1, $2, 'processing') RETURNING id`,
          [oldChar.id, (oldChar as any).cccd ?? '000000000000'],
        );
        settlementId = ins.rows[0]!.id;
      }

      // Xác định successor hợp lệ (NPC hậu duệ trực hệ còn sống, chưa thuộc user nào)
      let successor: any = null;
      if (successorId) {
        const ok = await (client as any).query(
          `WITH RECURSIVE descendants AS (
             SELECT ft.character_id, ft.parent_id FROM family_trees ft WHERE ft.parent_id = $1
             UNION ALL
             SELECT ft.character_id, ft.parent_id FROM family_trees ft JOIN descendants d ON ft.parent_id = d.character_id
           )
           SELECT c.* FROM descendants d JOIN characters c ON c.id = d.character_id
           WHERE c.id = $2 AND COALESCE(c.is_alive,true)=true AND c.user_id IS NULL`,
          [oldChar.id, successorId],
        );
        if (!ok.rows[0]) throw AppError.badRequest('Người kế thừa không hợp lệ (phải là hậu duệ trực hệ còn sống, chưa thuộc người chơi).');
        successor = ok.rows[0];
      }

      // (Pha 3) Tính thừa kế & giải ngân quỹ tín thác, (Pha 4) gom tài sản vô chủ -> đấu giá/ngân sách
      const settlement = await this.settleEstate(client, oldChar, successor, settlementId);

      // Bước 2: chuyển quyền điều khiển hoặc tạo nhân vật mới 18 tuổi
      let activeCharacterId: string;
      if (successor) {
        await client.query(`UPDATE characters SET user_id = $2, updated_at = now() WHERE id = $1`, [successor.id, userId]);
        activeCharacterId = successor.id;
      } else {
        // tạo nhân vật mới (cuộc đời mới hoàn toàn)
        const birthplace = '001';
        const cccd = await this.uniqueCccd(client, birthplace, 18);
        const accountNumber = await this.uniqueAccountNumber(client);
        const created = await (client as any).query(
          `INSERT INTO characters (id,user_id,full_name,account_number,cccd,birthplace,age,health_energy,cash_minor,credit_score,heat_level,is_alive,marital_status,location_x,location_y)
           VALUES (gen_random_uuid(), $1, 'Nhân vật mới', $2, $3, $4, 18, 100, 500000, 650, 0, true, 'single', 0, 2)
           RETURNING id`,
          [userId, accountNumber, cccd, birthplace],
        );
        activeCharacterId = created.rows[0]!.id;
      }

      // Bước 3: thanh lý ràng buộc đời trước
      // vợ/chồng cũ -> độc thân
      await client.query(`UPDATE characters SET marital_status='widowed', spouse_id=NULL, updated_at=now() WHERE spouse_id=$1`, [oldChar.id]);
      await client.query(`UPDATE characters SET marital_status='widowed', spouse_id=NULL, updated_at=now() WHERE id=$1`, [oldChar.id]);
      await client.query(`UPDATE marriage_contracts SET status='widowed', ended_at=now(), updated_at=now() WHERE (character_id=$1 OR spouse_id=$1) AND status='active'`, [oldChar.id]);
      // ngắt liên kết cha mẹ trên cây (con của người chết giữ cây nhưng parent_id tham chiếu có thể giữ để lịch sử; theo spec: ngắt liên kết parent_id = NULL)
      await client.query(`UPDATE family_trees SET parent_id = NULL WHERE parent_id = $1`, [oldChar.id]);
      // chuyển CEO công ty (nếu là owner) sang cổ đông lớn nhất tiếp theo
      const companies = await (client as any).query(`SELECT id FROM companies WHERE owner_character_id=$1`, [oldChar.id]);
      for (const co of companies.rows) {
        const top = await (client as any).query(
          `SELECT holder_character_id FROM company_shareholders WHERE company_id=$1 AND holder_character_id <> $2 ORDER BY shares DESC LIMIT 1`,
          [co.id, oldChar.id],
        );
        const newOwner = top.rows[0]?.holder_character_id ?? SYSTEM_SELLER_ID;
        await client.query(`UPDATE companies SET owner_character_id=$2, updated_at=now() WHERE id=$1`, [co.id, newOwner]);
      }
      // xóa nợ tín chấp cá nhân không tài sản đảm bảo (không có collateral_property_id)
      await client.query(`UPDATE loans SET status='repaid', outstanding_minor=0, updated_at=now() WHERE borrower_id=$1 AND collateral_property_id IS NULL`, [oldChar.id]);

      // Bước 4: XÓA CỨNG nhân vật cũ: gỡ tham chiếu có thể chặn xóa
      const sysSeller = '${SYSTEM_SELLER_ID}';
      await client.query(`UPDATE stock_trades SET buyer_character_id = NULL WHERE buyer_character_id = $1`, [oldChar.id]);
      await client.query(`UPDATE stock_trades SET seller_character_id = NULL WHERE seller_character_id = $1`, [oldChar.id]);
      await client.query(`UPDATE auctions SET seller_character_id = $2 WHERE seller_character_id = $1`, [oldChar.id, sysSeller]);
      await client.query(`UPDATE property_sale_offers SET status = 'cancelled', resolved_at = now(), updated_at = now() WHERE (buyer_character_id = $1 OR seller_character_id = $1) AND status = 'pending'`, [oldChar.id]);
      await client.query(`UPDATE property_sale_offers SET buyer_character_id = NULL WHERE buyer_character_id = $1`, [oldChar.id]);
      await client.query(`UPDATE property_sale_offers SET seller_character_id = NULL WHERE seller_character_id = $1`, [oldChar.id]);
      await client.query(`UPDATE loans SET status = 'repaid', outstanding_minor = 0 WHERE borrower_id = $1`, [oldChar.id]);
      await client.query(`DELETE FROM loans WHERE borrower_id = $1`, [oldChar.id]);
      await client.query(`DELETE FROM characters WHERE id = $1`, [oldChar.id]);

      await client.query(`UPDATE inheritance_settlements SET status='completed', successor_character_id=$2, processed_at=now(), updated_at=now() WHERE id=$1`, [settlementId, activeCharacterId]);

      return { settlementId, activeCharacterId, ...settlement };
    });
  }

  private async settleEstate(client: any, oldChar: any, successor: any, settlementId: string) {
    // Thu thập tài sản: tiền mặt, BĐS, cổ phần, tiết kiệm; trừ nợ có đảm bảo xử lý riêng
    const cash = Number(oldChar.cash_minor || 0);
    const props = (await (client as any).query(`SELECT id, current_value_minor, status, owner_character_id, node_id FROM properties WHERE owner_character_id=$1 FOR UPDATE`, [oldChar.id])).rows;
    const shares = (await (client as any).query(`SELECT id, company_id, shares FROM company_shareholders WHERE holder_character_id=$1`, [oldChar.id])).rows;
    const savings = Number((await (client as any).query(`SELECT COALESCE(SUM(balance_minor),0) AS s FROM savings_deposits WHERE character_id=$1 AND status='active'`, [oldChar.id])).rows[0]?.s || 0);
    // giải ngân quỹ tín thác (tách biệt, không bị siết nợ cá nhân) - trả trực tiếp cho beneficiaries còn sống
    const trust = await (client as any).query(`SELECT id, balance_minor FROM trust_funds WHERE character_id=$1 FOR UPDATE`, [oldChar.id]);
    let trustPaid = 0;
    for (const tf of trust.rows) {
      trustPaid += await this.disburseTrustFund(client, tf, settlementId);
    }

    // Xác định thụ hưởng di chúc
    const will = (await (client as any).query(`SELECT id FROM wills WHERE character_id=$1`, [oldChar.id])).rows[0];
    const beneficiaries = will ? (await (client as any).query(
      `SELECT wb.*, c.id AS char_id, COALESCE(c.is_alive,false) AS alive
       FROM will_beneficiaries wb
       LEFT JOIN characters c ON c.cccd = wb.beneficiary_cccd
       WHERE wb.will_id=$1 ORDER BY wb.created_at ASC`, [will.id]
    )).rows : [];

    // Giá trị di sản (ước tính): cash + savings + tổng giá trị BĐS + (cổ phần theo mệnh giá 0 nếu không định giá - đơn giản hóa)
    const propValue = props.reduce((s: number, p: any) => s + Number(p.current_value_minor || 0), 0);
    const shareValue = 0; // cổ phần đem đấu giá nếu không thừa kế; định giá thị trường phức tạp -> xử lý theo lô
    const grossEstate = cash + savings + propValue + shareValue;

    // Thuế thừa kế lũy tiến (trước khi bàn giao): miễn 500tr, 10% phần 500tr-2tỷ, 20% phần còn lại (mỗi lần nhận, đơn giản hóa trên tổng phần nhận)
    const calcInheritanceTax = (amount: number) => {
      const exempt = 500_000_000;
      if (amount <= exempt) return 0;
      const taxable = amount - exempt;
      const tier1 = Math.min(taxable, 1_500_000_000);
      const tier2 = Math.max(0, taxable - tier1);
      return Math.floor(tier1 * 0.10 + tier2 * 0.20);
    };

    // Phân bổ theo di chúc hoặc hàng thừa kế mặc định
    let allocations: Array<{ charId: string; pct: number }> = [];
    if (beneficiaries.length > 0) {
      for (const b of beneficiaries) {
        if (b.char_id && b.alive) allocations.push({ charId: b.char_id, pct: Number(b.share_pct) });
      }
    } else {
      // Hàng 1: vợ/chồng + con còn sống; Hàng 2: cha/mẹ, anh/chị/em ruột (đơn giản hóa: spouse + direct children sống)
      const spouse = (await (client as any).query(`SELECT id FROM characters WHERE id=$1 AND COALESCE(is_alive,false)=true`, [oldChar.spouse_id])).rows[0];
      const children = (await (client as any).query(
        `SELECT c.id FROM family_trees ft JOIN characters c ON c.id=ft.character_id WHERE ft.parent_id=$1 AND COALESCE(c.is_alive,false)=true`,
        [oldChar.id]
      )).rows;
      const heirs = [spouse?.id, ...children.map((x: any) => x.id)].filter(Boolean);
      if (heirs.length > 0) {
        const pct = 100 / heirs.length;
        allocations = heirs.map((id: string) => ({ charId: id, pct }));
      } else {
        // Hàng 2: cha/mẹ, anh/chị/em (không đủ dữ liệu quan hệ đầy đủ -> coi như không có)
        allocations = [];
      }
    }
    // chỉ phần % gán cho người còn sống; phần còn lại vô chủ
    const allocatedPct = Math.min(100, allocations.reduce((s, a) => s + a.pct, 0));
    const unallocatedPct = Math.max(0, 100 - allocatedPct);

    // Chuyển giao cho successor nếu successor là người thụ hưởng (theo logic "nhân vật kế tiếp" nhận phần của mình)
    let inheritedCash = 0;
    let inheritedPropValue = 0;
    const successorId = successor?.id ?? null;
    const successorAlloc = allocations.find((a) => a.charId === successorId);
    const successorShare = successorAlloc ? successorAlloc.pct / 100 : 0;

    // Đơn giản hóa chuyển giao: chuyển tiền mặt+tương đương theo tỷ lệ successor (sau thuế), chuyển BĐS ưu tiên cho successor nếu được hưởng
    const successorGross = Math.floor((cash + savings) * successorShare);
    const successorTax = calcInheritanceTax(successorGross);
    inheritedCash = Math.max(0, successorGross - successorTax);
    if (inheritedCash > 0 && successorId) {
      // chuyển tiền mặt trực tiếp vào cash của successor
      await client.query(`UPDATE characters SET cash_minor = cash_minor + $2, updated_at=now() WHERE id=$1`, [successorId, inheritedCash]);
      if (successorTax > 0) {
        await ledger.transfer(client, { from: { ownerType: 'character', ownerId: successorId }, to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID }, amountMinor: successorTax, kind: 'inheritance_tax', description: 'Thuế thừa kế', referenceType: 'inheritance_settlement', referenceId: settlementId }).catch(() => {});
      }
    }

    // Chuyển BĐS cho successor theo tỷ lệ giá trị (ưu tiên) - greedy
    let remainingPropValueForSuccessor = Math.floor(propValue * successorShare);
    const unclaimedProps: any[] = [];
    for (const p of props) {
      const v = Number(p.current_value_minor || 0);
      if (successorId && remainingPropValueForSuccessor >= v / 2 && p.status !== 'auction') {
        // chuyển cho successor
        await client.query(`UPDATE properties SET owner_character_id=$2, owner_company_id=NULL, status='owned', asking_price_minor=NULL, sale_notes=NULL, updated_at=now() WHERE id=$1`, [p.id, successorId]);
        remainingPropValueForSuccessor -= v;
        inheritedPropValue += v;
      } else {
        unclaimedProps.push(p);
      }
    }

    // Cổ phần: nếu successor không thừa kế hết -> phần vô chủ đưa đấu giá lô
    const unclaimedShares: any[] = [];
    for (const sh of shares) {
      if (successorId && successorShare >= 0.999) {
        await client.query(`UPDATE company_shareholders SET holder_character_id=$2 WHERE id=$1`, [sh.id, successorId]).catch(() => {});
      } else {
        unclaimedShares.push(sh);
      }
    }

    // Tiền mặt & tiết kiệm vô chủ -> sung công quỹ
    const unclaimedCash = Math.max(0, (cash + savings) - Math.floor((cash + savings) * successorShare));
    if (unclaimedCash > 0) {
      await ledger.transfer(client, { from: { ownerType: 'character', ownerId: oldChar.id }, to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID }, amountMinor: unclaimedCash, kind: 'estate_to_treasury', description: 'Tài sản vô chủ sung công quỹ', referenceType: 'inheritance_settlement', referenceId: settlementId }).catch(() => {});
    }

    // Tạo đấu giá cho BĐS vô chủ (65% base_land_price)
    for (const p of unclaimedProps) {
      await this.auctionUnclaimedProperty(client, p, settlementId, oldChar.id);
    }
    // Tạo bản ghi lô cổ phần vô chủ (đấu giá lô - đơn giản hóa: ghi unclaimed_estate_assets)
    for (const sh of unclaimedShares) {
      await client.query(
        `INSERT INTO unclaimed_estate_assets (id, settlement_id, deceased_character_id, asset_type, company_id, quantity_minor, status, details)
         VALUES (gen_random_uuid(), $1, $2, 'shares', $3, $4, 'pending', $5::jsonb)`,
        [settlementId, oldChar.id, sh.company_id, Number(sh.shares), JSON.stringify({ shareholderRowId: sh.id })],
      );
      // chuyển cổ phần tạm cho system để phát mại
      await client.query(`UPDATE company_shareholders SET holder_character_id=$2 WHERE id=$1`, [sh.id, SYSTEM_SELLER_ID]).catch(() => {});
    }

    await client.query(
      `UPDATE inheritance_settlements SET estate_cash_minor=$2, inherited_cash_minor=$3, unclaimed_cash_minor=$4, tax_minor=$5, details=$6::jsonb, updated_at=now() WHERE id=$1`,
      [settlementId, grossEstate, inheritedCash, unclaimedCash, 0, JSON.stringify({ trustPaid, successorShare, unallocatedPct, unclaimedProps: unclaimedProps.length, unclaimedShares: unclaimedShares.length })],
    );

    return { inheritedCash, unclaimedCash, trustPaid };
  }

  private async disburseTrustFund(client: any, tf: any, settlementId: string): Promise<number> {
    const balance = Number(tf.balance_minor || 0);
    if (balance <= 0) return 0;
    const bens = (await (client as any).query(
      `SELECT tfb.*, c.id AS char_id, COALESCE(c.is_alive,false) AS alive
       FROM trust_fund_beneficiaries tfb LEFT JOIN characters c ON c.cccd=tfb.beneficiary_cccd
       WHERE tfb.trust_fund_id=$1`, [tf.id]
    )).rows;
    let paid = 0;
    const living = bens.filter((b: any) => b.char_id && b.alive);
    if (living.length === 0) {
      // không có người thụ hưởng còn sống -> sung công quỹ
      await client.query(`UPDATE trust_funds SET balance_minor=0, updated_at=now() WHERE id=$1`, [tf.id]);
      // tiền đang ở escrow logic -> ghi nhận sung công (đơn giản hóa)
      return 0;
    }
    const totalPct = living.reduce((s: number, b: any) => s + Number(b.share_pct), 0) || 100;
    for (const b of living) {
      const amt = Math.floor(balance * (Number(b.share_pct) / totalPct));
      if (amt > 0) {
        await client.query(`UPDATE characters SET cash_minor = cash_minor + $2, updated_at=now() WHERE id=$1`, [b.char_id, amt]);
        paid += amt;
      }
    }
    const remainder = Math.max(0, balance - paid);
    await client.query(`UPDATE trust_funds SET balance_minor=0, updated_at=now() WHERE id=$1`, [tf.id]);
    if (remainder > 0) {
      // phần lẻ sung công
    }
    return paid;
  }

  private async auctionUnclaimedProperty(client: any, prop: any, settlementId: string, deceasedId: string) {
    // Giá khởi điểm = 65% base_land_price (map_nodes.land_price_minor)
    const node = (await (client as any).query(`SELECT land_price_minor FROM map_nodes WHERE id=$1`, [prop.node_id])).rows[0];
    const base = Number(node?.land_price_minor || prop.current_value_minor || 0);
    const startPrice = Math.max(1, Math.floor(base * 0.65));
    // chuyển quyền sở hữu về system/AI GM để đấu giá
    await client.query(`UPDATE properties SET owner_character_id=$2, owner_company_id=NULL, status='owned', asking_price_minor=NULL, sale_notes=NULL, updated_at=now() WHERE id=$1`, [prop.id, SYSTEM_SELLER_ID]);
    const endsAt = new Date(Date.now() + 24 * 3600 * 1000);
    const auc = await (client as any).query(
      `INSERT INTO auctions (id, property_id, seller_character_id, starting_price_minor, current_bid_minor, ends_at, status, source)
       VALUES (gen_random_uuid(), $1, $2, $3, $3, $4, 'open', 'estate')
       RETURNING id`,
      [prop.id, SYSTEM_SELLER_ID, startPrice, endsAt],
    );
    const auctionId = auc.rows[0]!.id;
    await client.query(
      `INSERT INTO unclaimed_estate_assets (id, settlement_id, deceased_character_id, asset_type, asset_ref_id, starting_price_minor, status, auction_id)
       VALUES (gen_random_uuid(), $1, $2, 'property', $3, $4, 'auctioned', $5)`,
      [settlementId, deceasedId, prop.id, startPrice, auctionId],
    );
  }

  private async uniqueCccd(client: any, birthplaceCode: string, birthAge?: number): Promise<string> {
    const birthYear = birthAge != null ? (new Date().getUTCFullYear() - birthAge) : undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = generateCccd(birthplaceCode, undefined, birthYear);
      const exists = await client.query(`SELECT 1 FROM characters WHERE cccd=$1 LIMIT 1`, [candidate]);
      if ((exists.rowCount ?? 0) === 0) return candidate;
    }
    throw AppError.conflict('cccd_exhausted', 'Không sinh được CCCD duy nhất.');
  }
  private async uniqueAccountNumber(client: any): Promise<string> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = String(Math.floor(1000000000 + Math.random() * 9000000000));
      const exists = await client.query(`SELECT 1 FROM characters WHERE account_number=$1 LIMIT 1`, [candidate]);
      if ((exists.rowCount ?? 0) === 0) return candidate;
    }
    throw AppError.conflict('account_number_exhausted', 'Không tạo được STK duy nhất.');
  }
}

