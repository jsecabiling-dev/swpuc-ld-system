const PERMISSIONS = [
    { key: 'users.add', column: 'can_add_users', label: 'Create user accounts' },
    { key: 'users.edit', column: 'can_edit_users', label: 'Edit user details and access permissions' },
    { key: 'users.delete', column: 'can_delete_users', label: 'Deactivate user accounts' },
    { key: 'courses.add', column: 'can_add_courses', label: 'Create learning courses and departments' },
    { key: 'courses.edit', column: 'can_edit_courses', label: 'Edit learning courses and departments' },
    { key: 'courses.delete', column: 'can_delete_courses', label: 'Delete learning courses' },
    { key: 'events.add', column: 'can_add_events', label: 'Create learning events and institutions' },
    { key: 'events.edit', column: 'can_edit_events', label: 'Edit learning events and institutions' },
    { key: 'events.delete', column: 'can_delete_events', label: 'Delete learning events' },
    { key: 'progress.add', column: 'can_add_progress', label: 'Register learners for learning events' },
    { key: 'progress.edit', column: 'can_edit_progress', label: 'Update learner attendance, progress, and certificates' },
    { key: 'progress.delete', column: 'can_delete_progress', label: 'Delete learner enrollment and progress records' }
];

function isAllowed(req, permission) {
    const capability = PERMISSIONS.find((item) => item.key === permission);
    return Boolean(capability && req.auth?.[capability.column]);
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!isAllowed(req, permission)) {
            return res.status(403).json({ success: false, message: 'Your account is not authorized to perform this action.' });
        }
        next();
    };
}

function requireAnyPermission(...permissions) {
    return (req, res, next) => {
        if (!permissions.some((permission) => isAllowed(req, permission))) {
            return res.status(403).json({ success: false, message: 'Your account is not authorized to perform this action.' });
        }
        next();
    };
}

module.exports = { PERMISSIONS, requirePermission, requireAnyPermission };
