CREATE TABLE IF NOT EXISTS certifier_courses (
    certifier_user_id INT NOT NULL,
    course_id INT NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (certifier_user_id, course_id),
    KEY certifier_courses_course_id (course_id),
    CONSTRAINT fk_certifier_courses_certifier
        FOREIGN KEY (certifier_user_id) REFERENCES certifiers(user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_certifier_courses_course
        FOREIGN KEY (course_id) REFERENCES learning_courses(course_id)
        ON DELETE CASCADE
);
