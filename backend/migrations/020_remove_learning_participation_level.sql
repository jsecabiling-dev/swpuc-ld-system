-- Participation records inherit their level through event_id -> course_id.
ALTER TABLE learning_participations
    DROP COLUMN learning_level;
