-- Incomplete signup accounts can be completed later by an administrator.
ALTER TABLE users
    MODIFY phone_number VARCHAR(20) NULL,
    MODIFY unit_id INT NULL;

ALTER TABLE signup_requests
    MODIFY status ENUM('pending', 'reviewed', 'dismissed', 'created') NOT NULL DEFAULT 'pending',
    ADD COLUMN created_user_id INT NULL,
    ADD CONSTRAINT signup_requests_created_user_fk
        FOREIGN KEY (created_user_id) REFERENCES users(user_id) ON DELETE SET NULL;
