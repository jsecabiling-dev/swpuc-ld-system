CREATE TABLE IF NOT EXISTS learning_participations (
    participation_id INT(11) NOT NULL AUTO_INCREMENT,
    user_id INT(11) NOT NULL,
    event_name VARCHAR(200) NOT NULL,
    learning_level VARCHAR(100) NULL,
    participation_role ENUM('Learner', 'Mentor') NOT NULL DEFAULT 'Learner',
    certification_name VARCHAR(200) NULL,
    certificate_number VARCHAR(100) NULL,
    certification_date DATE NULL,
    created_by INT(11) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (participation_id),
    KEY learning_participations_user_id (user_id),
    KEY learning_participations_event_name (event_name),
    CONSTRAINT learning_participations_ibfk_1 FOREIGN KEY (user_id)
        REFERENCES users (user_id),
    CONSTRAINT learning_participations_ibfk_2 FOREIGN KEY (created_by)
        REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
