-- Down: revert Phase 6 tables (0012_phase6.sql)
BEGIN;

DROP TABLE IF EXISTS gm_directives;
DROP TABLE IF EXISTS npc_negotiations;
DROP TABLE IF EXISTS ai_metrics;
DROP TABLE IF EXISTS news_items;

COMMIT;
