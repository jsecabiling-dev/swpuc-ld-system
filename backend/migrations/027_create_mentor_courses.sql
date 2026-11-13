CREATE TABLE IF NOT EXISTS mentor_courses (
    mentor_user_id INT NOT NULL,
    course_id INT NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mentor_user_id, course_id),
    KEY mentor_courses_course_id (course_id),
    CONSTRAINT fk_mentor_courses_mentor
        FOREIGN KEY (mentor_user_id) REFERENCES mentors(user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_mentor_courses_course
        FOREIGN KEY (course_id) REFERENCES learning_courses(course_id)
        ON DELETE CASCADE
);
