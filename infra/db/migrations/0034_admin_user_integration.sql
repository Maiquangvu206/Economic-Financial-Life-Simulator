-- 0034: Liên kết admin ↔ người dùng: broadcast hệ thống, cấu hình game/mùa, tiện ích tra cứu
BEGIN;

CREATE TABLE IF NOT EXISTS system_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  type text NOT NULL DEFAULT 'news'
    CHECK (type IN ('urgent', 'maintenance', 'event', 'economy', 'news')),
  scope text NOT NULL DEFAULT 'all'
    CHECK (scope IN ('all', 'workers', 'investors', 'businesses')),
  pinned boolean NOT NULL DEFAULT false,
  sender text NOT NULL DEFAULT 'Ban Quản trị',
  sender_actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_broadcasts_created_idx ON system_broadcasts (created_at DESC);
CREATE INDEX IF NOT EXISTS system_broadcasts_pinned_idx ON system_broadcasts (pinned, created_at DESC);

-- Đảm bảo có bản ghi game_state để cấu hình mùa/vĩ mô và snapshot đọc được
INSERT INTO game_state (id, current_day, current_year, season, macro)
VALUES (1, 0, 1, 'spring', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMIT;
