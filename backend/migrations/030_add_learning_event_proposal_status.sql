ALTER TABLE learning_events
    ADD COLUMN status ENUM('Submitted', 'For evaluation', 'Approved', 'Rejected')
        NOT NULL DEFAULT 'Approved' AFTER description;

ALTER TABLE learning_events
    MODIFY COLUMN status ENUM('Submitted', 'For evaluation', 'Approved', 'Rejected')
        NOT NULL DEFAULT 'Submitted';
