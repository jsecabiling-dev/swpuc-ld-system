-- Learning courses are union-wide catalog entries; the event record defines
-- the institution and delivery details for each local offering.
-- Keep legacy values intact while allowing new catalog rows without them.
ALTER TABLE learning_courses
    MODIFY COLUMN institution_id INT(11) NULL,
    MODIFY COLUMN delivery_mode ENUM('In_Person', 'Online', 'Hybrid') NULL;
