import type { PoolClient } from 'pg';
import { debitStateFund, getStateFundBalance } from './stateFund.js';

export interface SupportCompaniesInput {
  scope: 'all' | 'selected';
  companyIds?: string[];
  /** Mã chứng khoán (ticker) của công ty được chỉ định, vd: VCB, FPT */
  tickers?: string[];
  amountPerCompanyMinor: number;
  reason: string;
  actorType: 'admin' | 'mayor' | 'system';
  actorId?: string | null;
  refType?: string;
  refId?: string | null;
}

export interface SupportTarget {
  id: string;
  name: string;
  symbol: string | null;
}

export interface SupportCompaniesResult {
  supportedCompanies: number;
  amountPerCompanyMinor: number;
  totalSpentMinor: number;
  boostedTickers: number;
  balanceAfter: number;
  companyIds: string[];
  tickers: string[];
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function normalizeTickers(tickers?: string[]): string[] {
  return Array.from(
    new Set(
      (tickers ?? [])
        .map((t) => String(t ?? '').trim().toUpperCase())
        .filter((t) => t.length > 0),
    ),
  );
}

/**
 * Xác định danh sách công ty được hỗ trợ.
 * - scope 'all': toàn bộ công ty đang hoạt động/IPO.
 * - scope 'selected': chỉ định theo Mã chứng khoán (tickers) hoặc ID công ty (companyIds, giữ tương thích).
 * Ticker được ưu tiên; chỉ công ty đang niêm yết mới tra được theo ticker.
 */
export async function resolveSupportTargets(
  client: PoolClient,
  input: { scope: 'all' | 'selected'; companyIds?: string[]; tickers?: string[] },
): Promise<SupportTarget[]> {
  if (input.scope === 'all') {
    const r = await client.query<SupportTarget>(
      `SELECT c.id, c.name, st.symbol
         FROM companies c
         LEFT JOIN stock_tickers st ON st.company_id = c.id
        WHERE c.status IN ('active','ipo')
        ORDER BY c.id`,
    );
    return r.rows;
  }

  const ids = Array.from(new Set((input.companyIds ?? []).filter(Boolean)));
  const tickers = normalizeTickers(input.tickers);
  if (ids.length === 0 && tickers.length === 0) throw new Error('NO_COMPANIES');

  const r = await client.query<SupportTarget>(
    `SELECT DISTINCT c.id, c.name, st.symbol
       FROM companies c
       LEFT JOIN stock_tickers st ON st.company_id = c.id
      WHERE c.status IN ('active','ipo')
        AND (upper(st.symbol) = ANY($1::text[]) OR c.id = ANY($2::uuid[]))`,
    [tickers, ids],
  );
  if (r.rows.length === 0 && tickers.length > 0 && ids.length === 0) {
    throw new Error('TICKERS_NOT_FOUND');
  }
  return r.rows;
}

export async function supportCompaniesFromStateFund(
  client: PoolClient,
  input: SupportCompaniesInput,
): Promise<SupportCompaniesResult> {
  const amountPerCompanyMinor = Math.trunc(Number(input.amountPerCompanyMinor));
  if (!Number.isFinite(amountPerCompanyMinor) || amountPerCompanyMinor <= 0) {
    throw new Error('INVALID_AMOUNT');
  }

  const targets = await resolveSupportTargets(client, {
    scope: input.scope,
    companyIds: input.companyIds,
    tickers: input.tickers,
  });

  if (targets.length === 0) {
    throw new Error('NO_ELIGIBLE_COMPANIES');
  }

  const total = amountPerCompanyMinor * targets.length;
  const fundBal = await getStateFundBalance(client as any);
  if (fundBal < total) {
    throw new Error('STATE_FUND_INSUFFICIENT');
  }

  let boostedTickers = 0;
  const supportedTickers: string[] = [];
  for (const c of targets) {
    if (c.symbol) supportedTickers.push(c.symbol);
    await debitStateFund(
      client as any,
      { ownerType: 'company', ownerId: c.id, kind: 'cash' },
      amountPerCompanyMinor,
      {
        amountMinor: -amountPerCompanyMinor,
        reasonCode: 'company_support_stock',
        description: `Hỗ trợ công ty "${c.name}"${c.symbol ? ` (${c.symbol})` : ''} từ quỹ đất nước: ${input.reason}`,
        refType: 'company',
        refId: c.id,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        ledgerKind: 'state_fund_company_support',
        ledgerDescription: `Hỗ trợ công ty từ quỹ đất nước`,
        meta: { reason: input.reason, scope: input.scope, symbol: c.symbol },
      },
    );
    // debitStateFund credits company ledger but does not mirror companies.cash_minor
    await client.query(
      `UPDATE companies SET cash_minor = cash_minor + $2::bigint, updated_at = now() WHERE id = $1`,
      [c.id, amountPerCompanyMinor],
    );

    // Boost stock market activity/volatility for the company's listed ticker (1:1 company_id)
    const t = await client.query<{ id: string; current_price_minor: string }>(
      `SELECT id, current_price_minor::text AS current_price_minor
       FROM stock_tickers WHERE company_id = $1 LIMIT 1`,
      [c.id],
    );
    const ticker = t.rows[0];
    if (ticker) {
      const seed = hashSeed(`${c.id}:${Date.now()}:${amountPerCompanyMinor}`);
      const pct = ((seed % 900) - 450) / 100; // -4.5%..+4.49%
      const cur = Math.max(1, Number(ticker.current_price_minor || 1));
      const next = Math.max(100, Math.round(cur * (1 + pct / 100)));
      const volBoost = Math.max(500, Math.round(amountPerCompanyMinor / 1_000_000) * 50 + 1000);
      await client.query(
        `UPDATE stock_tickers
            SET previous_close_minor = current_price_minor,
                current_price_minor = $2::bigint,
                total_volume = GREATEST(0, total_volume + $3::bigint)
          WHERE id = $1::uuid`,
        [ticker.id, next, volBoost],
      );
      boostedTickers += 1;
    }
  }

  const balanceAfter = await getStateFundBalance(client as any);
  return {
    supportedCompanies: targets.length,
    amountPerCompanyMinor,
    totalSpentMinor: total,
    boostedTickers,
    balanceAfter,
    companyIds: targets.map((x) => x.id),
    tickers: supportedTickers,
  };
}
