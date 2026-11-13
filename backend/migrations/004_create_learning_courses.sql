CREATE TABLE learning_courses (
    course_id INT(11) NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    learning_objectives TEXT NULL,
    learning_outcomes TEXT NULL,
    duration_hours DECIMAL(7,2) NULL,
    delivery_mode ENUM('In_Person', 'Online', 'Hybrid') NOT NULL,
    certificate_issued TINYINT(1) NOT NULL DEFAULT 0,
    institution_id INT(11) NOT NULL,
    created_by INT(11) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (course_id),
    KEY learning_courses_institution_id (institution_id),
    KEY learning_courses_created_by (created_by),
    CONSTRAINT learning_courses_ibfk_1 FOREIGN KEY (institution_id)
        REFERENCES organizational_units (unit_id),
    CONSTRAINT learning_courses_ibfk_2 FOREIGN KEY (created_by)
        REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
