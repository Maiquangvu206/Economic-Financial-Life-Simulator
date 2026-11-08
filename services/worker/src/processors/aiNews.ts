import { pool } from '../db.js';
import { logger } from '../logger.js';
import { callAi } from '../aiClient.js';
import { enqueueDomainEvent } from '../outboxEvents.js';

interface NewsProposal {
  headline: string;
  body: string;
  reputation_delta: Record<string, number>;
  stock_impact_pct: Record<string, number>;
  meta?: { proposal_id?: string; model?: string; prompt_version?: string };
}

/** Tác động giá tối đa áp dụng mỗi bản tin cho một mã (biên, % điểm). */
const MAX_APPLIED_IMPACT_PCT = 5;

/**
 * AI news theo cron: gọi AI service lấy bản tin + tác động giá,
 * clamp trong [-20, 20] theo contract và chỉ áp dụng tối đa ±5% mỗi mã,
 * ghi news_items + broadcast qua outbox.
 */
export async function processAiNews(): Promise<{ applied: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tickers = await client.query<{ id: string; symbol: string }>(
      `SELECT id, symbol FROM stock_tickers ORDER BY symbol ASC LIMIT 12`,
    );
    const symbols = tickers.rows.map((t) => t.symbol);
    const eventId = crypto.randomUUID();

    const { data } = await callAi<NewsProposal>('/v1/news', 'news', 'fake', 'news@v1', {
      event_id: eventId,
      event_type: 'market_daily',
      actors: [],
      facts: [
        `Ngày tin tức hằng ngày: kiểm tra ${symbols.length} mã niêm yết.`,
        'GM đang giám sát lạm phát và vốn hóa thị trường.',
      ],
      tone: 'neutral',
    });

    const headline = data.headline ?? 'Bản tin thị trường';
    const body = data.body ?? '';
    const rawImpact = data.stock_impact_pct ?? {};
    // Fake provider trả {} → sinh tác động nhỏ theo ticker để demo giá có biên.
    const impact: Record<string, number> = {};
    for (const symbol of symbols) {
      const raw =
        rawImpact[symbol] ??
        (symbols.indexOf(symbol) % 3 === 0 ? 2 : symbols.indexOf(symbol) % 3 === 1 ? -1.5 : 0.5);
      impact[symbol] = Math.max(-20, Math.min(20, raw));
    }

    let applied = 0;
    for (const [symbol, pct] of Object.entries(impact)) {
      const bounded = Math.max(-MAX_APPLIED_IMPACT_PCT, Math.min(MAX_APPLIED_IMPACT_PCT, pct));
      if (bounded === 0) continue;
      const updated = await client.query<{ symbol: string; price: bigint }>(
        `UPDATE stock_tickers
          SET current_price_minor = GREATEST(1000, ROUND(current_price_minor * (1 + $2::numeric / 100)))
          RETURNING symbol, current_price_minor AS price`,
        [symbol, bounded],
      );
      if (updated.rows[0]) applied += 1;
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO news_items (id, headline, body, event_type, stock_impact)
       VALUES (gen_random_uuid(), $1, $2, 'market_daily', $3::jsonb)
       RETURNING id`,
      [headline, body, JSON.stringify(impact)],
    );

    // Phát tán bản tin cho mọi người chơi có tài khoản (bảng users)
    const users = await client.query<{ id: string }>(`SELECT id FROM users LIMIT 200`);
    for (const u of users.rows) {
      await client.query(
        `INSERT INTO notifications (id, user_id, kind, title, body, payload)
         VALUES (gen_random_uuid(), $1, 'news', $2, $3, $4::jsonb)`,
        [
          u.id,
          headline,
          body.slice(0, 500),
          JSON.stringify({ newsId: inserted.rows[0]!.id, impact, applied }),
        ],
      );
    }

    await enqueueDomainEvent(client, {
      type: 'news.published.v1',
      aggregateType: 'news',
      aggregateId: inserted.rows[0]!.id,
      payload: { headline, impact, applied },
    });

    await client.query('COMMIT');
    logger.info({ newsId: inserted.rows[0]!.id, applied }, 'AI news applied');
    return { applied };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err: error }, 'AI news failed');
    throw error;
  } finally {
    client.release();
  }
}
