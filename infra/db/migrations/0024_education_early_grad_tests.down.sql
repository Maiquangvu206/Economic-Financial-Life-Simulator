BEGIN;
DROP TABLE IF EXISTS education_early_grad_tests;
DELETE FROM schema_migrations WHERE filename = '0024_education_early_grad_tests.sql';
COMMIT;
