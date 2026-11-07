-- EFLS starter content (0003).
--
-- Deterministic seed data so a fresh database is immediately playable:
-- universities, jobs, city map, NPC companies listed on the exchange,
-- logistics nodes and the system-owned market maker.
--
-- All UUIDs are fixed so reruns and tests can reference them.

BEGIN;

-- System identity that owns NPC companies. It cannot log in (invalid hash).
INSERT INTO users (id, email, username, password_hash, role)
VALUES ('00000000-0000-4000-8000-000000000001', 'system@efls.local', 'system', '!disabled', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO characters
  (id, user_id, full_name, age, health_energy, cash_minor, credit_score, heat_level,
   marital_status, location_x, location_y)
VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001',
   'EFLS Market Maker', 40, 100, 0, 850, 0, 'single', 0, 0)
ON CONFLICT DO NOTHING;

INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, balance_minor, is_system)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'character',
        '00000000-0000-4000-8000-0000000000c1', 'cash', 0, false)
ON CONFLICT (owner_type, owner_id, kind, currency) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Education
-- ---------------------------------------------------------------------------

INSERT INTO universities (id, name, degree_code, field, tuition_minor, duration_months, stat_bonus)
VALUES
  ('11111111-1111-4111-8111-000000000001', 'Metro Business School', 'business',
   'finance_banking', 1200000, 24, '{"creditScore": 20, "salaryBonusPct": 15}'::jsonb),
  ('11111111-1111-4111-8111-000000000002', 'Institute of Technology', 'computer_science',
   'technology_ai', 1500000, 24, '{"creditScore": 10, "salaryBonusPct": 25}'::jsonb),
  ('11111111-1111-4111-8111-000000000003', 'City Law Academy', 'law',
   'education', 1800000, 36, '{"creditScore": 15, "salaryBonusPct": 20}'::jsonb)
ON CONFLICT (degree_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

INSERT INTO jobs (id, title, industry, base_salary_minor, required_degree, min_credit_score, energy_cost, openings)
VALUES
  ('22222222-2222-4222-8222-000000000001', 'Junior Analyst', 'finance_banking', 350000, 'business', 620, 10, 3),
  ('22222222-2222-4222-8222-000000000002', 'Software Engineer', 'technology_ai', 420000, 'computer_science', 650, 12, 3),
  ('22222222-2222-4222-8222-000000000003', 'Real Estate Agent', 'real_estate', 300000, NULL, 600, 10, 2),
  ('22222222-2222-4222-8222-000000000004', 'Logistics Coordinator', 'logistics', 280000, NULL, 580, 9, 3),
  ('22222222-2222-4222-8222-000000000005', 'Corporate Lawyer', 'education', 550000, 'law', 700, 12, 1),
  ('22222222-2222-4222-8222-000000000006', 'Factory Supervisor', 'energy_mining', 260000, NULL, 560, 14, 2),
  ('22222222-2222-4222-8222-000000000007', 'Port Operations Manager', 'logistics', 380000, 'business', 640, 11, 1),
  ('22222222-2222-4222-8222-000000000008', 'Financial Advisor', 'finance_banking', 500000, 'business', 680, 10, 1)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- City map & properties
-- ---------------------------------------------------------------------------

INSERT INTO map_nodes (id, x, y, zone_type, name)
VALUES
  ('33333333-3333-4333-8333-000000000001', 2, 2, 'port', 'Harbor Gate'),
  ('33333333-3333-4333-8333-000000000002', 12, 7, 'residential', 'Maple Residences'),
  ('33333333-3333-4333-8333-000000000003', 5, 9, 'residential', 'Riverside Houses'),
  ('33333333-3333-4333-8333-000000000004', 10, 5, 'commercial', 'Central Business Tower'),
  ('33333333-3333-4333-8333-000000000005', 8, 4, 'industrial', 'North Freight Hub'),
  ('33333333-3333-4333-8333-000000000006', 4, 3, 'slum', 'Backstreets')
ON CONFLICT (x, y) DO NOTHING;

INSERT INTO properties
  (id, node_id, property_type, purchase_price_minor, current_value_minor, monthly_rent_minor, asking_price_minor, status)
VALUES
  ('44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-000000000002',
   'apartment', 18000000, 18000000, 90000, 18000000, 'unowned'),
  ('44444444-4444-4444-8444-000000000002', '33333333-3333-4333-8333-000000000003',
   'house', 55000000, 55000000, 220000, 55000000, 'unowned'),
  ('44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000004',
   'office', 120000000, 120000000, 500000, 120000000, 'unowned'),
  ('44444444-4444-4444-8444-000000000004', '33333333-3333-4333-8333-000000000005',
   'warehouse', 80000000, 80000000, 300000, 80000000, 'unowned'),
  ('44444444-4444-4444-8444-000000000005', '33333333-3333-4333-8333-000000000001',
   'port_berth', 250000000, 250000000, 900000, 250000000, 'unowned')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- NPC companies + exchange listings
-- ---------------------------------------------------------------------------

INSERT INTO companies
  (id, name, industry, owner_character_id, cash_minor, valuation_minor, status, ticker_symbol)
VALUES
  ('55555555-5555-4555-8555-000000000001', 'Vertex Systems', 'technology_ai',
   '00000000-0000-4000-8000-0000000000c1', 50000000, 900000000, 'ipo', 'VTX'),
  ('55555555-5555-4555-8555-000000000002', 'Meridian Bank', 'finance_banking',
   '00000000-0000-4000-8000-0000000000c1', 120000000, 1500000000, 'ipo', 'MDB'),
  ('55555555-5555-4555-8555-000000000003', 'Atlas Freight', 'logistics',
   '00000000-0000-4000-8000-0000000000c1', 40000000, 600000000, 'ipo', 'ATF'),
  ('55555555-5555-4555-8555-000000000004', 'Helios Energy', 'energy_mining',
   '00000000-0000-4000-8000-0000000000c1', 70000000, 1100000000, 'ipo', 'HLE'),
  ('55555555-5555-4555-8555-000000000005', 'Nimbus Realty', 'real_estate',
   '00000000-0000-4000-8000-0000000000c1', 30000000, 500000000, 'ipo', 'NMR')
ON CONFLICT (name) DO NOTHING;

INSERT INTO company_shareholders (id, company_id, holder_character_id, shares)
VALUES
  ('66666666-6666-4666-8666-000000000001', '55555555-5555-4555-8555-000000000001',
   '00000000-0000-4000-8000-0000000000c1', 9000000),
  ('66666666-6666-4666-8666-000000000002', '55555555-5555-4555-8555-000000000002',
   '00000000-0000-4000-8000-0000000000c1', 9000000),
  ('66666666-6666-4666-8666-000000000003', '55555555-5555-4555-8555-000000000003',
   '00000000-0000-4000-8000-0000000000c1', 9000000),
  ('66666666-6666-4666-8666-000000000004', '55555555-5555-4555-8555-000000000004',
   '00000000-0000-4000-8000-0000000000c1', 9000000),
  ('66666666-6666-4666-8666-000000000005', '55555555-5555-4555-8555-000000000005',
   '00000000-0000-4000-8000-0000000000c1', 9000000)
ON CONFLICT (company_id, holder_character_id) DO NOTHING;

INSERT INTO stock_tickers
  (id, company_id, symbol, current_price_minor, previous_close_minor, total_volume, is_ipo)
VALUES
  ('77777777-7777-4777-8777-000000000001', '55555555-5555-4555-8555-000000000001', 'VTX', 4200, 4100, 0, true),
  ('77777777-7777-4777-8777-000000000002', '55555555-5555-4555-8555-000000000002', 'MDB', 8800, 8700, 0, true),
  ('77777777-7777-4777-8777-000000000003', '55555555-5555-4555-8555-000000000003', 'ATF', 3100, 3050, 0, true),
  ('77777777-7777-4777-8777-000000000004', '55555555-5555-4555-8555-000000000004', 'HLE', 5600, 5700, 0, true),
  ('77777777-7777-4777-8777-000000000005', '55555555-5555-4555-8555-000000000005', 'NMR', 2700, 2650, 0, true)
ON CONFLICT (symbol) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Logistics nodes
-- ---------------------------------------------------------------------------

INSERT INTO logistics_nodes (id, name, node_type, node_id, capacity)
VALUES
  ('88888888-8888-4888-8888-000000000001', 'Harbor Gate Seaport', 'seaport',
   '33333333-3333-4333-8333-000000000001', 120),
  ('88888888-8888-4888-8888-000000000002', 'North Freight Hub', 'hub',
   '33333333-3333-4333-8333-000000000005', 80)
ON CONFLICT DO NOTHING;

COMMIT;
