ALTER TABLE users
    ADD COLUMN standard_entry_time TIME NOT NULL DEFAULT '08:30',
    ADD COLUMN standard_exit_time TIME NOT NULL DEFAULT '17:20',
    ADD CONSTRAINT chk_users_standard_exit_after_entry CHECK (standard_exit_time > standard_entry_time);
