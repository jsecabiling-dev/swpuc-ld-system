-- Removes the legacy user role lookup without changing accounts, institutions,
-- or any per-user permission columns. Apply during a controlled maintenance window:
-- back up the database, stop the backend, deploy the code that no longer reads
-- roles or users.role_id, apply this migration, then restart the backend.
--
-- The preflight checks stop before making changes if another table still has a
-- foreign key to roles or if another table depends on users.role_id.

DELIMITER $$

DROP PROCEDURE IF EXISTS migration_031_remove_user_roles$$

CREATE PROCEDURE migration_031_remove_user_roles()
BEGIN
    DECLARE v_users_exists INT DEFAULT 0;
    DECLARE v_role_column_exists INT DEFAULT 0;
    DECLARE v_roles_exists INT DEFAULT 0;
    DECLARE v_unexpected_role_references INT DEFAULT 0;
    DECLARE v_incoming_user_role_references INT DEFAULT 0;
    DECLARE v_done BOOLEAN DEFAULT FALSE;
    DECLARE v_constraint_name VARCHAR(64);

    DECLARE role_fk_cursor CURSOR FOR
        SELECT DISTINCT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'role_id'
          AND REFERENCED_TABLE_NAME IS NOT NULL;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

    SELECT COUNT(*) INTO v_users_exists
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users';

    IF v_users_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration 031 stopped: users table was not found in the selected database.';
    END IF;

    SELECT COUNT(*) INTO v_role_column_exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role_id';

    SELECT COUNT(*) INTO v_roles_exists
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles';

    SELECT COUNT(*) INTO v_unexpected_role_references
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'roles'
      AND NOT (TABLE_NAME = 'users' AND COLUMN_NAME = 'role_id');

    IF v_unexpected_role_references > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration 031 stopped: another table references roles. Review that relationship before removing the table.';
    END IF;

    SELECT COUNT(*) INTO v_incoming_user_role_references
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'users'
      AND REFERENCED_COLUMN_NAME = 'role_id'
      AND NOT (TABLE_NAME = 'users' AND COLUMN_NAME = 'role_id');

    IF v_incoming_user_role_references > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration 031 stopped: another table depends on users.role_id. Review that relationship before removing the column.';
    END IF;

    IF v_role_column_exists > 0 THEN
        OPEN role_fk_cursor;
        drop_role_foreign_keys: LOOP
            FETCH role_fk_cursor INTO v_constraint_name;
            IF v_done THEN
                LEAVE drop_role_foreign_keys;
            END IF;

            SET @migration_031_sql = CONCAT(
                'ALTER TABLE `users` DROP FOREIGN KEY `',
                REPLACE(v_constraint_name, '`', '``'),
                '`'
            );
            PREPARE migration_031_statement FROM @migration_031_sql;
            EXECUTE migration_031_statement;
            DEALLOCATE PREPARE migration_031_statement;
        END LOOP;
        CLOSE role_fk_cursor;

        ALTER TABLE `users` DROP COLUMN `role_id`;
    END IF;

    IF v_roles_exists > 0 THEN
        DROP TABLE `roles`;
    END IF;
END$$

CALL migration_031_remove_user_roles()$$
DROP PROCEDURE migration_031_remove_user_roles$$

DELIMITER ;
