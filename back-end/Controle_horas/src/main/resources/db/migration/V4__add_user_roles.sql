ALTER TABLE users
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'USER',
    ADD COLUMN manager_id UUID NULL;

ALTER TABLE users
    ADD CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'MANAGER', 'USER'));

ALTER TABLE users
    ADD CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(id);

CREATE INDEX idx_users_manager_id ON users(manager_id);

ALTER TABLE users
    ADD CONSTRAINT chk_users_admin_without_manager CHECK (
        role <> 'ADMIN' OR manager_id IS NULL
    );
