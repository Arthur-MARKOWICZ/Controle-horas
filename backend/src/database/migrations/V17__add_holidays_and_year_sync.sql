CREATE TABLE holidays (
    id               UUID PRIMARY KEY,
    organization_id  UUID NULL REFERENCES users(id) ON DELETE CASCADE,
    country_code     CHAR(2) NOT NULL DEFAULT 'BR',
    subdivision_code VARCHAR(10) NULL,
    date             DATE NOT NULL,
    name             VARCHAR(160) NOT NULL,
    scope            VARCHAR(20) NOT NULL,
    source           VARCHAR(20) NOT NULL,
    external_key     VARCHAR(200) NULL,
    created_by_id    UUID NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_holidays_scope CHECK (scope IN ('NATIONAL','SUBDIVISION','MUNICIPAL','COMPANY')),
    CONSTRAINT chk_holidays_source CHECK (source IN ('NAGER','MANUAL')),
    CONSTRAINT chk_holidays_ownership CHECK (
        (source = 'NAGER' AND organization_id IS NULL AND external_key IS NOT NULL)
     OR (source = 'MANUAL' AND organization_id IS NOT NULL AND created_by_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_holidays_synced
    ON holidays (country_code, date, COALESCE(subdivision_code, ''), external_key)
    WHERE source = 'NAGER';

CREATE UNIQUE INDEX uq_holidays_manual
    ON holidays (organization_id, date, LOWER(name))
    WHERE source = 'MANUAL';

CREATE INDEX idx_holidays_date ON holidays (date);

CREATE INDEX idx_holidays_organization_date ON holidays (organization_id, date)
    WHERE organization_id IS NOT NULL;

CREATE TABLE holiday_year_syncs (
    country_code  CHAR(2) NOT NULL,
    year          INTEGER NOT NULL,
    status        VARCHAR(20) NOT NULL,
    holiday_count INTEGER NOT NULL DEFAULT 0,
    attempts      INTEGER NOT NULL DEFAULT 1,
    error_message VARCHAR(255) NULL,
    synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (country_code, year),
    CONSTRAINT chk_holiday_year_syncs_status CHECK (status IN ('SUCCESS','FAILED')),
    CONSTRAINT chk_holiday_year_syncs_year CHECK (year BETWEEN 1900 AND 2200)
);
