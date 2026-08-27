CREATE TABLE mobile_biometric_credentials (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_mobile_biometric_credentials_user_id
    ON mobile_biometric_credentials(user_id);

CREATE INDEX idx_mobile_biometric_credentials_active_user
    ON mobile_biometric_credentials(user_id)
    WHERE revoked_at IS NULL;
