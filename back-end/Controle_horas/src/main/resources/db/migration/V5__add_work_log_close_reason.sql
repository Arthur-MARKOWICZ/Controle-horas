ALTER TABLE work_logs
    ADD COLUMN close_reason VARCHAR(20);

UPDATE work_logs
SET close_reason = 'EXIT'
WHERE exit_at IS NOT NULL AND close_reason IS NULL;

ALTER TABLE work_logs
    ADD CONSTRAINT chk_work_logs_close_reason CHECK (
        close_reason IS NULL OR close_reason IN ('PAUSE', 'EXIT')
    );

ALTER TABLE work_logs
    ADD CONSTRAINT chk_work_logs_close_reason_with_exit CHECK (
        (exit_at IS NULL AND close_reason IS NULL)
        OR (exit_at IS NOT NULL AND close_reason IS NOT NULL)
    );
