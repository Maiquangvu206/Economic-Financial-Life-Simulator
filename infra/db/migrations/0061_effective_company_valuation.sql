-- Effective company valuation: cash-inclusive book base blended with market cap for IPO companies.
-- Forward-only helper; does not mutate stored valuation_minor.
CREATE OR REPLACE FUNCTION effective_company_valuation(p_company_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      c.id,
      c.cash_minor,
      c.valuation_minor,
      c.status,
      t.current_price_minor,
      GREATEST(c.valuation_minor, c.cash_minor) AS book_base,
      GREATEST(
        COALESCE((SELECT SUM(shares)::bigint FROM company_shareholders cs WHERE cs.company_id = c.id), 0),
        COALESCE((SELECT SUM(shares)::bigint FROM stock_holdings h JOIN stock_tickers st ON st.id = h.ticker_id WHERE st.company_id = c.id), 0)
      ) AS outstanding_shares
    FROM companies c
    LEFT JOIN stock_tickers t ON t.company_id = c.id
    WHERE c.id = p_company_id
  )
  SELECT COALESCE((
    SELECT CASE
      WHEN b.status = 'ipo'
        AND b.current_price_minor IS NOT NULL
        AND b.current_price_minor > 0
        AND b.outstanding_shares > 0
      THEN
        -- Blend: 60% market cap + 40% cash-inclusive book base (sàn tại book base)
        GREATEST(
          ((b.current_price_minor * b.outstanding_shares) * 3 + b.book_base * 2) / 5,
          b.book_base
        )
      ELSE b.book_base
    END
    FROM base b
  ), 0)::bigint;
$$;
