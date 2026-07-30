ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_standard_exit_after_entry;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_daily_workload_minutes_check;

ALTER TABLE users ALTER COLUMN standard_entry_time DROP NOT NULL;
ALTER TABLE users ALTER COLUMN standard_entry_time DROP DEFAULT;

ALTER TABLE users ALTER COLUMN standard_exit_time DROP NOT NULL;
ALTER TABLE users ALTER COLUMN standard_exit_time DROP DEFAULT;

ALTER TABLE users ALTER COLUMN work_days DROP NOT NULL;
ALTER TABLE users ALTER COLUMN work_days DROP DEFAULT;

ALTER TABLE users ALTER COLUMN lunch_enabled SET DEFAULT FALSE;

ALTER TABLE users ALTER COLUMN lunch_duration_minutes SET DEFAULT 0;

ALTER TABLE users ALTER COLUMN daily_workload_minutes SET DEFAULT 0;
