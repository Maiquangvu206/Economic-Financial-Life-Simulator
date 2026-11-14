-- Seed default Admin and Moderator accounts for development and testing.
-- Password for both accounts is: Admin1234!
-- Hash generated with bcryptjs cost 12.

BEGIN;

-- Admin account
INSERT INTO users (id, email, username, password_hash, role)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  'admin@efls.local',
  'admin',
  '$2a$12$jUwJe/AR/Qk0D8MuhsCq.OXBSyCC3tEMgSiFYkx0ZHgz.cU5zyJCq',
  'admin'
)
ON CONFLICT (lower(email)) DO UPDATE
  SET role = 'admin', password_hash = EXCLUDED.password_hash;

INSERT INTO characters (
  id, user_id, full_name, age, health_energy, cash_minor, credit_score, heat_level,
  marital_status, location_x, location_y, cccd, birthplace
)
VALUES (
  '00000000-0000-4000-8000-0000000000c2',
  '00000000-0000-4000-8000-000000000002',
  'Tổng Quản Trị Hệ Thống',
  35,
  100,
  1000000000000, -- 10 tỷ ₫
  850,
  0,
  'single',
  10,
  5,
  '001000000001',
  '001'
)
ON CONFLICT DO NOTHING;

-- Moderator account
INSERT INTO users (id, email, username, password_hash, role)
VALUES (
  '00000000-0000-4000-8000-000000000003',
  'moderator@efls.local',
  'moderator',
  '$2a$12$jUwJe/AR/Qk0D8MuhsCq.OXBSyCC3tEMgSiFYkx0ZHgz.cU5zyJCq',
  'moderator'
)
ON CONFLICT (lower(email)) DO UPDATE
  SET role = 'moderator', password_hash = EXCLUDED.password_hash;

INSERT INTO characters (
  id, user_id, full_name, age, health_energy, cash_minor, credit_score, heat_level,
  marital_status, location_x, location_y, cccd, birthplace
)
VALUES (
  '00000000-0000-4000-8000-0000000000c3',
  '00000000-0000-4000-8000-000000000003',
  'Điều Hành Viên Hệ Thống',
  30,
  100,
  500000000000, -- 5 tỷ ₫
  800,
  0,
  'single',
  10,
  5,
  '001000000002',
  '001'
)
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (filename) VALUES ('0025_seed_admin_accounts.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

