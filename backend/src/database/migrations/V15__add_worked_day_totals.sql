ALTER TABLE users
    ADD COLUMN total_worked_days INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN scheduled_worked_days INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN outside_schedule_worked_days INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_users_worked_day_totals CHECK (
        total_worked_days = scheduled_worked_days + outside_schedule_worked_days
        AND scheduled_worked_days >= 0
        AND outside_schedule_worked_days >= 0
    );

CREATE TABLE user_work_schedule_versions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    work_days VARCHAR(100) NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, effective_from)
);

INSERT INTO user_work_schedule_versions(user_id, effective_from, work_days)
SELECT id, DATE '0001-01-01', COALESCE(work_days, '')
FROM users;

WITH worked_dates AS (
    SELECT DISTINCT log.user_id, day.date::DATE AS worked_date
    FROM work_logs log
    CROSS JOIN LATERAL generate_series(
        (log.entry_at AT TIME ZONE 'America/Sao_Paulo')::DATE,
        ((log.exit_at - INTERVAL '1 microsecond') AT TIME ZONE 'America/Sao_Paulo')::DATE,
        INTERVAL '1 day'
    ) AS day(date)
    WHERE log.exit_at IS NOT NULL AND log.exit_at > log.entry_at
), classified AS (
    SELECT worked_dates.user_id,
        CASE EXTRACT(ISODOW FROM worked_dates.worked_date)::INTEGER
            WHEN 1 THEN 'MONDAY' WHEN 2 THEN 'TUESDAY' WHEN 3 THEN 'WEDNESDAY'
            WHEN 4 THEN 'THURSDAY' WHEN 5 THEN 'FRIDAY' WHEN 6 THEN 'SATURDAY'
            ELSE 'SUNDAY'
        END = ANY(string_to_array(COALESCE(schedule.work_days, ''), ',')) AS in_schedule
    FROM worked_dates
    LEFT JOIN LATERAL (
        SELECT work_days FROM user_work_schedule_versions
        WHERE user_id = worked_dates.user_id AND effective_from <= worked_dates.worked_date
        ORDER BY effective_from DESC LIMIT 1
    ) schedule ON TRUE
), totals AS (
    SELECT user_id, COUNT(*)::INTEGER AS total,
        COUNT(*) FILTER (WHERE in_schedule)::INTEGER AS in_schedule,
        COUNT(*) FILTER (WHERE NOT in_schedule)::INTEGER AS outside_schedule
    FROM classified GROUP BY user_id
)
UPDATE users
SET total_worked_days = COALESCE((SELECT total FROM totals WHERE totals.user_id = users.id), 0),
    scheduled_worked_days = COALESCE((SELECT in_schedule FROM totals WHERE totals.user_id = users.id), 0),
    outside_schedule_worked_days = COALESCE((SELECT outside_schedule FROM totals WHERE totals.user_id = users.id), 0);
