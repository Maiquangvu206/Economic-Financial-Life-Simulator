-- Recruitment (jobs postings): open -> closed -> wait 1 game day -> deletable
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS posting_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS closed_game_year integer NULL,
  ADD COLUMN IF NOT EXISTS closed_game_day integer NULL;

DO 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_posting_status_check'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_posting_status_check
      CHECK (posting_status IN ('open','closed','deleted'));
  END IF;
END ;

CREATE INDEX IF NOT EXISTS jobs_employer_posting_idx
  ON jobs (employer_company_id, posting_status, id DESC);
