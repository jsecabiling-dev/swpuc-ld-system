-- Learning events inherit their level from the required course catalog record.
ALTER TABLE learning_events
    DROP COLUMN learning_level;
