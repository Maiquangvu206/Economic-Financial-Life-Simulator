BEGIN;

CREATE TABLE IF NOT EXISTS education_early_grad_tests (
  id uuid PRIMARY KEY,
  degree_id uuid NOT NULL REFERENCES degrees(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  questions jsonb NOT NULL, -- [{id,question,options,correct_index,explanation}]
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','passed','failed','expired')),
  score integer,
  required_score integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  submitted_at timestamptz
);

CREATE INDEX IF NOT EXISTS education_early_grad_tests_degree_idx
  ON education_early_grad_tests (degree_id, character_id, created_at DESC);

INSERT INTO schema_migrations (filename) VALUES ('0024_education_early_grad_tests.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
