-- 0018: Tuyển dụng AI (chờ duyệt) + sổ cái/kế toán doanh nghiệp + khai thuế.

BEGIN;

-- Đợt tuyển dụng do AI đề xuất, người chơi duyệt/áp dụng.
CREATE TABLE IF NOT EXISTS company_hiring_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'cancelled')),
  role_focus      text NOT NULL DEFAULT '',
  headcount       integer NOT NULL DEFAULT 3 CHECK (headcount BETWEEN 1 AND 20),
  rationale       text NOT NULL DEFAULT '',
  ai_model        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  applied_at      timestamptz
);
CREATE INDEX IF NOT EXISTS company_hiring_plans_company_idx
  ON company_hiring_plans (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS company_hiring_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL REFERENCES company_hiring_plans (id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  role_title      text NOT NULL,
  seniority       text NOT NULL DEFAULT 'junior',
  proposed_salary_minor bigint NOT NULL CHECK (proposed_salary_minor >= 0),
  fit_score       integer NOT NULL DEFAULT 50 CHECK (fit_score BETWEEN 0 AND 100),
  risk_note       text NOT NULL DEFAULT '',
  ai_reason       text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed', 'approved', 'rejected', 'hired')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_hiring_candidates_plan_idx
  ON company_hiring_candidates (plan_id);

-- Nhân sự NPC do AI sắp xếp và người chơi duyệt tuyển.
CREATE TABLE IF NOT EXISTS company_staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  candidate_id    uuid REFERENCES company_hiring_candidates (id) ON DELETE SET NULL,
  full_name       text NOT NULL,
  role_title      text NOT NULL,
  salary_minor    bigint NOT NULL CHECK (salary_minor >= 0),
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'fired', 'resigned')),
  hired_at        timestamptz NOT NULL DEFAULT now(),
  fired_at        timestamptz
);
CREATE INDEX IF NOT EXISTS company_staff_company_idx ON company_staff (company_id, status);

-- Sổ cái/kế toán doanh nghiệp (ghi nhận thực tế vs khai báo để phục vụ trốn thuế/lách luật).
CREATE TABLE IF NOT EXISTS company_ledger_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  entry_type          text NOT NULL
                      CHECK (entry_type IN ('revenue', 'opex', 'payroll', 'tax', 'adjustment', 'fine', 'bribe', 'other')),
  amount_minor        bigint NOT NULL CHECK (amount_minor >= 0),
  declared_amount_minor bigint NOT NULL CHECK (declared_amount_minor >= 0),
  description         text NOT NULL DEFAULT '',
  is_evasion          boolean NOT NULL DEFAULT false,
  meta                jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_ledger_entries_company_idx
  ON company_ledger_entries (company_id, occurred_at DESC);

-- Hồ sơ khai thuế doanh nghiệp (so sánh thực tế vs khai báo).
CREATE TABLE IF NOT EXISTS company_tax_filings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  period                text NOT NULL, -- ví dụ 2026-Q1 hoặc 2026-11
  declared_revenue_minor bigint NOT NULL DEFAULT 0,
  actual_revenue_minor   bigint NOT NULL DEFAULT 0,
  declared_expense_minor bigint NOT NULL DEFAULT 0,
  actual_expense_minor   bigint NOT NULL DEFAULT 0,
  tax_due_minor          bigint NOT NULL DEFAULT 0,
  tax_paid_minor         bigint NOT NULL DEFAULT 0,
  risk_score             integer NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  status                 text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'filed', 'audited', 'penalized')),
  notes                  text NOT NULL DEFAULT '',
  created_at             timestamptz NOT NULL DEFAULT now(),
  filed_at               timestamptz
);
CREATE INDEX IF NOT EXISTS company_tax_filings_company_idx
  ON company_tax_filings (company_id, created_at DESC);

COMMIT;
