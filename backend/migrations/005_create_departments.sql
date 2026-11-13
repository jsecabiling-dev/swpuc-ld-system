CREATE TABLE departments (
    department_id INT(11) NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    institution_id INT(11) NOT NULL,
    created_by INT(11) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (department_id),
    UNIQUE KEY departments_institution_name (institution_id, name),
    KEY departments_created_by (created_by),
    CONSTRAINT departments_ibfk_1 FOREIGN KEY (institution_id)
        REFERENCES organizational_units (unit_id),
    CONSTRAINT departments_ibfk_2 FOREIGN KEY (created_by)
        REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
