CREATE TABLE IF NOT EXISTS learning_event_mentors (
    event_id INT NOT NULL,
    mentor_user_id INT NOT NULL,
    PRIMARY KEY (event_id, mentor_user_id),
    KEY learning_event_mentors_user_id (mentor_user_id),
    CONSTRAINT fk_learning_event_mentors_event
        FOREIGN KEY (event_id) REFERENCES learning_events(event_id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_event_mentors_mentor
        FOREIGN KEY (mentor_user_id) REFERENCES mentors(user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS learning_event_certifiers (
    event_id INT NOT NULL,
    certifier_user_id INT NOT NULL,
    PRIMARY KEY (event_id, certifier_user_id),
    KEY learning_event_certifiers_user_id (certifier_user_id),
    CONSTRAINT fk_learning_event_certifiers_event
        FOREIGN KEY (event_id) REFERENCES learning_events(event_id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_event_certifiers_certifier
        FOREIGN KEY (certifier_user_id) REFERENCES certifiers(user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
