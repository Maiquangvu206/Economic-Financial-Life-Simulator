import type { PoolClient } from 'pg';
import { debitStateFund, getStateFundBalance } from './stateFund.js';

export interface SupportCompaniesInput {
  scope: 'all' | 'selected';
  companyIds?: string[];
  amountPerCompanyMinor: number;
  reason: string;
  actorType: 'admin' | 'mayor' | 'system';
  actorId?: string | null;
  refType?: string;
  refId?: string | null;
}

export interface SupportCompaniesResult {
  supportedCompanies: number;
  amountPerCompanyMinor: number;
  totalSpentMinor: number;
  boostedTickers: number;
  balanceAfter: number;
  companyIds: string[];
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export async function supportCompaniesFromStateFund(
  client: PoolClient,
  input: SupportCompaniesInput,
): Promise<SupportCompaniesResult> {
  const amountPerCompanyMinor = Math.trunc(Number(input.amountPerCompanyMinor));
  if (!Number.isFinite(amountPerCompanyMinor) || amountPerCompanyMinor <= 0) {
    throw new Error('INVALID_AMOUNT');
  }

  let targets: Array<{ id: string; name: string }> = [];
  if (input.scope === 'all') {
    const r = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM companies WHERE status IN ('active','ipo') ORDER BY id`,
    );
    targets = r.rows;
  } else {
    const ids = Array.from(new Set((input.companyIds ?? []).filter(Boolean)));
    if (ids.length === 0) throw new Error('NO_COMPANIES');
    const r = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM companies WHERE id = ANY($1::uuid[]) AND status IN ('active','ipo')`,
      [ids],
    );
    targets = r.rows;
  }

  if (targets.length === 0) {
    throw new Error('NO_ELIGIBLE_COMPANIES');
  }

  const total = amountPerCompanyMinor * targets.length;
  const fundBal = await getStateFundBalance(client as any);
  if (fundBal < total) {
    throw new Error('STATE_FUND_INSUFFICIENT');
  }

  let boostedTickers = 0;
  for (const c of targets) {
    await debitStateFund(
      client as any,
      { ownerType: 'company', ownerId: c.id, kind: 'cash' },
      amountPerCompanyMinor,
      {
        amountMinor: -amountPerCompanyMinor,
        reasonCode: 'company_support_stock',
        description: `Hỗ trợ công ty "${c.name}" từ quỹ đất nước: ${input.reason}`,
        refType: 'company',
        refId: c.id,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        ledgerKind: 'state_fund_company_support',
        ledgerDescription: `Hỗ trợ công ty từ quỹ đất nước`,
        meta: { reason: input.reason, scope: input.scope },
      },
    );
    // debitStateFund credits company ledger but does not mirror companies.cash_minor
    await client.query(
      `UPDATE companies SET cash_minor = cash_minor + $2::bigint, updated_at = now() WHERE id = $1`,
      [c.id, amountPerCompanyMinor],
    );

    // Boost stock market activity/volatility for listed tickers of this company
    const t = await client.query<{ id: string; current_price_minor: string }>(
      `SELECT id, current_price_minor::text AS current_price_minor
       FROM stock_tickers WHERE company_id = $1
       ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1`,
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
                total_volume = GREATEST(0, total_volume + $3::bigint),
                updated_at = now()
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
  };
}
