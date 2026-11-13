-- Require every participation to reference an existing learning event.
-- Events with participant records are restricted from deletion so history is preserved.
ALTER TABLE learning_participations
    DROP FOREIGN KEY learning_participations_ibfk_3;

ALTER TABLE learning_participations
    DROP INDEX learning_participations_event_name,
    DROP COLUMN event_name,
    MODIFY COLUMN event_id INT(11) NOT NULL;

ALTER TABLE learning_participations
    ADD CONSTRAINT learning_participations_ibfk_3 FOREIGN KEY (event_id)
        REFERENCES learning_events (event_id) ON DELETE RESTRICT;
