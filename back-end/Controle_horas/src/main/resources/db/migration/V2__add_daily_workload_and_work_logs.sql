ALTER TABLE users
    ADD COLUMN daily_workload_minutes INTEGER NOT NULL DEFAULT 530
    CHECK (daily_workload_minutes BETWEEN 1 AND 1440);

CREATE TABLE work_logs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    entry_at TIMESTAMPTZ NOT NULL,
    exit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_work_logs_exit_after_entry CHECK (exit_at IS NULL OR exit_at >= entry_at)
);

CREATE INDEX idx_work_logs_user_entry_at ON work_logs(user_id, entry_at);
CREATE UNIQUE INDEX uk_work_logs_one_open_per_user ON work_logs(user_id) WHERE exit_at IS NULL;
