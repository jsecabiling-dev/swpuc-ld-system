ALTER TABLE organizational_units
MODIFY COLUMN unit_type ENUM(
    'Union',
    'Mission',
    'District',
    'Local_Church',
    'Hospital',
    'School',
    'Services'
) NOT NULL;
