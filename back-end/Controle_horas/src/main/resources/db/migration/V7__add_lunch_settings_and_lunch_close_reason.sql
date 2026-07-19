ALTER TABLE users
    ADD COLUMN lunch_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
    ADD COLUMN lunch_duration_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE users
    ADD CONSTRAINT chk_users_lunch_duration_minutes CHECK (
        lunch_duration_minutes BETWEEN 0 AND 240
    );

UPDATE users
SET daily_workload_minutes = GREATEST(
    1,
    (
        EXTRACT(HOUR FROM standard_exit_time)::INTEGER * 60
            + EXTRACT(MINUTE FROM standard_exit_time)::INTEGER
    ) - (
        EXTRACT(HOUR FROM standard_entry_time)::INTEGER * 60
            + EXTRACT(MINUTE FROM standard_entry_time)::INTEGER
    ) - CASE WHEN lunch_enabled THEN lunch_duration_minutes ELSE 0 END
);

ALTER TABLE work_logs
    DROP CONSTRAINT chk_work_logs_close_reason;

ALTER TABLE work_logs
    ADD CONSTRAINT chk_work_logs_close_reason CHECK (
        close_reason IS NULL OR close_reason IN ('PAUSE', 'EXIT', 'LUNCH')
    );
