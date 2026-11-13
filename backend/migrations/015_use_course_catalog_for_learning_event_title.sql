-- Learning events get their title from the required course catalog reference.
-- Existing events were checked and already have a course_id.
ALTER TABLE learning_events
    DROP FOREIGN KEY learning_events_ibfk_1;

ALTER TABLE learning_events
    DROP COLUMN title,
    MODIFY COLUMN course_id INT(11) NOT NULL;

ALTER TABLE learning_events
    ADD CONSTRAINT learning_events_course_catalog_fk FOREIGN KEY (course_id)
        REFERENCES learning_courses (course_id) ON DELETE RESTRICT;
