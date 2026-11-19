-- 1=Union, 2=Mission, 3=District, 4=Local church,
-- 5=Hospital, 6=School, 7=Services.
ALTER TABLE organizational_units MODIFY unit_type VARCHAR(20) NOT NULL;
UPDATE organizational_units SET unit_type = CASE unit_type
    WHEN 'Union' THEN '1' WHEN 'Mission' THEN '2' WHEN 'District' THEN '3'
    WHEN 'Local_Church' THEN '4' WHEN 'Hospital' THEN '5'
    WHEN 'School' THEN '6' WHEN 'Services' THEN '7' ELSE unit_type END;
ALTER TABLE organizational_units
    MODIFY unit_type TINYINT UNSIGNED NOT NULL
        COMMENT '1=Union, 2=Mission, 3=District, 4=Local church, 5=Hospital, 6=School, 7=Services',
    ADD CONSTRAINT chk_unit_type_code CHECK (unit_type IN (1, 2, 3, 4, 5, 6, 7));
