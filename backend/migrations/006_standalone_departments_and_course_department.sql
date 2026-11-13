ALTER TABLE departments
    DROP FOREIGN KEY departments_ibfk_1,
    DROP INDEX departments_institution_name,
    DROP COLUMN institution_id,
    ADD UNIQUE KEY departments_name (name);

ALTER TABLE learning_courses
    ADD COLUMN department_id INT(11) NULL AFTER institution_id,
    ADD KEY learning_courses_department_id (department_id),
    ADD CONSTRAINT learning_courses_ibfk_3 FOREIGN KEY (department_id)
        REFERENCES departments (department_id);
