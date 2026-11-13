CREATE TABLE IF NOT EXISTS learning_events (
    event_id INT(11) NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    course_id INT(11) NULL,
    institution_id INT(11) NOT NULL,
    department_id INT(11) NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    venue VARCHAR(255) NULL,
    delivery_mode ENUM('In_Person', 'Online', 'Hybrid') NOT NULL,
    description TEXT NULL,
    created_by INT(11) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id),
    KEY learning_events_course_id (course_id),
    KEY learning_events_institution_id (institution_id),
    KEY learning_events_department_id (department_id),
    KEY learning_events_start_date (start_date),
    CONSTRAINT learning_events_ibfk_1 FOREIGN KEY (course_id)
        REFERENCES learning_courses (course_id) ON DELETE SET NULL,
    CONSTRAINT learning_events_ibfk_2 FOREIGN KEY (institution_id)
        REFERENCES organizational_units (unit_id),
    CONSTRAINT learning_events_ibfk_3 FOREIGN KEY (department_id)
        REFERENCES departments (department_id) ON DELETE SET NULL,
    CONSTRAINT learning_events_ibfk_4 FOREIGN KEY (created_by)
        REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
