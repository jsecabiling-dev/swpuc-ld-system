ALTER TABLE users
    ADD COLUMN can_add_users BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_edit_users BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_delete_users BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_add_courses BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_edit_courses BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_delete_courses BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_add_events BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_edit_events BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_delete_events BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_add_progress BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_edit_progress BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_delete_progress BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users SET
    can_add_users = can_manage_users,
    can_edit_users = can_manage_users,
    can_delete_users = can_manage_users,
    can_add_courses = can_manage_courses,
    can_edit_courses = can_manage_courses,
    can_delete_courses = can_manage_courses,
    can_add_events = can_manage_events,
    can_edit_events = can_manage_events,
    can_delete_events = can_manage_events,
    can_add_progress = can_manage_progress,
    can_edit_progress = can_manage_progress,
    can_delete_progress = can_manage_progress;

ALTER TABLE users
    DROP COLUMN can_manage_users,
    DROP COLUMN can_manage_courses,
    DROP COLUMN can_manage_events,
    DROP COLUMN can_manage_progress;
