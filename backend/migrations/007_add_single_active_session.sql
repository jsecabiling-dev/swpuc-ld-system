ALTER TABLE users
ADD COLUMN active_session_id CHAR(36) NULL AFTER must_change_password;
