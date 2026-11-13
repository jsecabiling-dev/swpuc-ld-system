ALTER TABLE learning_participations
    ADD COLUMN attended TINYINT(1) NOT NULL DEFAULT 0 AFTER participation_role,
    ADD COLUMN completed TINYINT(1) NOT NULL DEFAULT 0 AFTER attended,
    ADD COLUMN certified TINYINT(1) NOT NULL DEFAULT 0 AFTER completed;
