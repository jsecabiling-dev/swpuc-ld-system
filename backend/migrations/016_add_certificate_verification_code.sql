ALTER TABLE learning_participations
    ADD COLUMN certificate_verification_code CHAR(48) NULL UNIQUE;
