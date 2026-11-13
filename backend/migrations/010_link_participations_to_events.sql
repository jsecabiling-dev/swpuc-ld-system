ALTER TABLE learning_participations
    ADD COLUMN event_id INT(11) NULL AFTER user_id,
    ADD KEY learning_participations_event_id (event_id),
    ADD CONSTRAINT learning_participations_ibfk_3 FOREIGN KEY (event_id)
        REFERENCES learning_events (event_id) ON DELETE SET NULL;
