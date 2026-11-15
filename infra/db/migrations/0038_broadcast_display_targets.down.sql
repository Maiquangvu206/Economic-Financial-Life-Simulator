ALTER TABLE system_broadcasts
  DROP COLUMN IF EXISTS show_on_login,
  DROP COLUMN IF EXISTS show_in_app;
