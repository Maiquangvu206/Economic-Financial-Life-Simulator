-- Phase 6: AI nâng cao & vận hành
--
-- Bảng bổ sung:
-- - news_items: bản tin AI (có tác động giá, đã clamp biên)
-- - ai_metrics: đo chi phí / độ trễ / tokens cho cost-latency dashboard
-- - npc_negotiations: lịch sử đàm phán NPC theo tính cách
-- - gm_directives: chỉ thị điều chỉnh vĩ mô của GM AI

BEGIN;

CREATE TABLE IF NOT EXISTS news_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline          text NOT NULL,
  body              text NOT NULL DEFAULT '',
  event_type        text NOT NULL DEFAULT 'market_daily',
  stock_impact      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_items_created_idx
  ON news_items (created_at DESC);

CREATE TABLE IF NOT EXISTS ai_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task            text NOT NULL,
  model           text NOT NULL,
  prompt_version  text NOT NULL DEFAULT 'v1',
  latency_ms      integer NOT NULL CHECK (latency_ms >= 0),
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  cost_usd        numeric(12, 6) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_metrics_created_idx
  ON ai_metrics (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_metrics_task_idx
  ON ai_metrics (task, created_at DESC);

CREATE TABLE IF NOT EXISTS npc_negotiations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id    uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  npc_id          text NOT NULL,
  personality     text NOT NULL
                  CHECK (personality IN ('aggressive', 'cautious', 'greedy', 'honest')),
  context         text NOT NULL DEFAULT '',
  player_offer    text NOT NULL DEFAULT '',
  fair_value      bigint NOT NULL CHECK (fair_value >= 0),
  dialogue        text NOT NULL DEFAULT '',
  accept          boolean NOT NULL DEFAULT false,
  counter_offer   bigint,
  mood_delta      numeric(4, 2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS npc_negotiations_character_idx
  ON npc_negotiations (character_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gm_directives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action          text NOT NULL
                  CHECK (action IN ('raise_rate', 'cut_rate', 'trigger_crisis', 'stimulus', 'do_nothing')),
  magnitude       numeric(4, 2) NOT NULL CHECK (magnitude BETWEEN 0 AND 1),
  rationale       text NOT NULL DEFAULT '',
  snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gm_directives_created_idx
  ON gm_directives (created_at DESC);

COMMIT;
