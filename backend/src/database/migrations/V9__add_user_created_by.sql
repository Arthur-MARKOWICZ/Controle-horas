ALTER TABLE users
    ADD COLUMN created_by_id UUID NULL;

ALTER TABLE users
    ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by_id) REFERENCES users(id);

CREATE INDEX idx_users_created_by_id ON users(created_by_id);

UPDATE users
SET created_by_id = manager_id
WHERE manager_id IS NOT NULL
  AND created_by_id IS NULL;
