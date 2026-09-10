CREATE TABLE holiday_rules (
    id              UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    holiday_id      UUID NOT NULL REFERENCES holidays(id) ON DELETE CASCADE,
    user_id         UUID NULL REFERENCES users(id) ON DELETE CASCADE,
    day_off         BOOLEAN NOT NULL DEFAULT TRUE,
    observed_date   DATE NULL,
    bridge_date     DATE NULL,
    notes           VARCHAR(255) NULL,
    created_by_id   UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(120) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_holiday_rules_observed CHECK (observed_date IS NULL OR day_off)
);

CREATE UNIQUE INDEX uq_holiday_rules_organization
    ON holiday_rules (organization_id, holiday_id) WHERE user_id IS NULL;

CREATE UNIQUE INDEX uq_holiday_rules_user
    ON holiday_rules (holiday_id, user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_holiday_rules_organization ON holiday_rules (organization_id);
