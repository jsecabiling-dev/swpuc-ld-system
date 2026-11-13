CREATE TABLE community_role_assignments (
    community_role ENUM('mentor', 'certifier') NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_role, user_id),
    CONSTRAINT fk_community_role_assignments_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
);
