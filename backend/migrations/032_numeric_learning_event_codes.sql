-- Preserve existing labels before conversion (ENUM ordinals must not be used).
-- Delivery: 1 In_Person, 2 Online, 3 Hybrid.
-- Status: 1 Submitted, 2 For evaluation, 3 Approved, 4 Rejected.
ALTER TABLE learning_events
    MODIFY delivery_mode VARCHAR(20) NOT NULL,
    MODIFY status VARCHAR(20) NOT NULL DEFAULT 'Submitted';
ALTER TABLE learning_courses MODIFY delivery_mode VARCHAR(20) NULL;

UPDATE learning_events SET delivery_mode = CASE delivery_mode
    WHEN 'In_Person' THEN '1' WHEN 'Online' THEN '2' WHEN 'Hybrid' THEN '3'
    ELSE delivery_mode END,
    status = CASE status
    WHEN 'Submitted' THEN '1' WHEN 'For evaluation' THEN '2'
    WHEN 'Approved' THEN '3' WHEN 'Rejected' THEN '4' ELSE status END;
UPDATE learning_courses SET delivery_mode = CASE delivery_mode
    WHEN 'In_Person' THEN '1' WHEN 'Online' THEN '2' WHEN 'Hybrid' THEN '3'
    ELSE delivery_mode END;

ALTER TABLE learning_events
    MODIFY delivery_mode TINYINT UNSIGNED NOT NULL COMMENT '1=In person, 2=Online, 3=Hybrid',
    MODIFY status TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=Submitted, 2=For evaluation, 3=Approved, 4=Rejected',
    ADD CONSTRAINT chk_event_delivery_code CHECK (delivery_mode IN (1, 2, 3)),
    ADD CONSTRAINT chk_event_status_code CHECK (status IN (1, 2, 3, 4));
ALTER TABLE learning_courses
    MODIFY delivery_mode TINYINT UNSIGNED NULL COMMENT '1=In person, 2=Online, 3=Hybrid',
    ADD CONSTRAINT chk_course_delivery_code CHECK (delivery_mode IN (1, 2, 3));
