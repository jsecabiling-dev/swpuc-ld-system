const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');

const router = express.Router();
const roleTables = { mentor: 'mentors', certifier: 'certifiers' };

async function authenticateToken(req, res, next) {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return res.status(401).json({ success: false, message: 'Sign in to continue.' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await db.execute(
            `SELECT u.user_id, u.must_change_password, u.active_session_id,
                    u.can_add_users, u.can_edit_users, u.can_delete_users,
                    u.can_edit_courses
             FROM users u WHERE u.user_id = ? AND u.is_active = TRUE`,
            [payload.userId]
        );
        if (!rows.length) return res.status(401).json({ success: false, message: 'Your account is inactive or no longer exists.' });
        if (!payload.sessionId || rows[0].active_session_id !== payload.sessionId) return res.status(401).json({ success: false, message: 'Your session is no longer active. Please sign in again.' });
        if (rows[0].must_change_password) return res.status(403).json({ success: false, message: 'Change your password before using this feature.' });
        req.auth = rows[0];
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Your session is invalid or expired. Please sign in again.' });
        next(error);
    }
}

const requireAdd = requirePermission('users.add');
const requireEdit = requirePermission('users.edit');
const requireDelete = requirePermission('users.delete');
const requireCourseEdit = requirePermission('courses.edit');
router.use(authenticateToken);

router.get('/:role', async (req, res, next) => {
    const role = String(req.params.role).toLowerCase();
    if (!Object.hasOwn(roleTables, role)) return res.status(404).json({ success: false, message: 'Community role not found.' });
    const table = roleTables[role];
    try {
        const [rows] = await db.execute(
            `SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.suffix,
                    u.email, u.phone_number, u.profilepict, u.is_active,
                    o.name AS unit_name, a.created_at AS assigned_at,
                    (SELECT COUNT(*) FROM ${role}_courses assignment
                     WHERE assignment.${role}_user_id = a.user_id) AS assigned_course_count
             FROM ${table} a
             JOIN users u ON u.user_id = a.user_id
             LEFT JOIN organizational_units o ON o.unit_id = u.unit_id
             ORDER BY u.last_name, u.first_name, u.user_id`
        );
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

router.get('/:role/candidates', requireAnyPermission('users.add', 'users.edit'), async (req, res, next) => {
    const role = String(req.params.role).toLowerCase();
    const table = roleTables[role];
    if (!table) return res.status(404).json({ success: false, message: 'Community role not found.' });
    try {
        const [rows] = await db.execute(
            `SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.suffix,
                    u.email, u.phone_number, o.name AS unit_name
             FROM users u LEFT JOIN organizational_units o ON o.unit_id = u.unit_id
             WHERE u.is_active = TRUE AND NOT EXISTS (
                 SELECT 1 FROM ${table} a
                 WHERE a.user_id = u.user_id
             ) ORDER BY u.last_name, u.first_name, u.user_id`,
            []
        );
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

router.get('/mentor/:userId/courses', async (req, res, next) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ success: false, message: 'Invalid mentor ID.' });
    try {
        const [rows] = await db.execute(
            `SELECT course.course_id, course.title, course.learning_level,
                    department.name AS department_name, mentor_courses.assigned_at
             FROM mentor_courses
             JOIN learning_courses course ON course.course_id = mentor_courses.course_id
             LEFT JOIN departments department ON department.department_id = course.department_id
             WHERE mentor_courses.mentor_user_id = ?
             ORDER BY course.title, course.course_id`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

router.get('/mentor/:userId', async (req, res, next) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ success: false, message: 'Invalid mentor ID.' });
    try {
        const [rows] = await db.execute(
            `SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.suffix,
                    u.email, u.phone_number, u.profilepict, u.is_active,
                    o.name AS unit_name
             FROM mentors m JOIN users u ON u.user_id = m.user_id
             LEFT JOIN organizational_units o ON o.unit_id = u.unit_id
             WHERE m.user_id = ?`,
            [userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Mentor not found.' });
        res.json({ success: true, data: rows[0] });
    } catch (error) { next(error); }
});

router.get('/:role/:userId', async (req, res, next) => {
    const role = String(req.params.role).toLowerCase();
    const table = roleTables[role];
    const userId = Number(req.params.userId);
    if (!table) return res.status(404).json({ success: false, message: 'Community role not found.' });
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ success: false, message: 'Invalid account ID.' });
    try {
        const [rows] = await db.execute(
            `SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.suffix,
                    u.email, u.phone_number, u.profilepict, u.is_active,
                    o.name AS unit_name
             FROM ${table} a JOIN users u ON u.user_id = a.user_id
             LEFT JOIN organizational_units o ON o.unit_id = u.unit_id
             WHERE a.user_id = ?`,
            [userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: `${role === 'mentor' ? 'Mentor' : 'Certifier'} not found.` });
        res.json({ success: true, data: rows[0] });
    } catch (error) { next(error); }
});

router.get('/certifier/:userId/courses', async (req, res, next) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ success: false, message: 'Invalid certifier ID.' });
    try {
        const [rows] = await db.execute(
            `SELECT course.course_id, course.title, course.learning_level,
                    department.name AS department_name, certifier_courses.assigned_at
             FROM certifier_courses
             JOIN learning_courses course ON course.course_id = certifier_courses.course_id
             LEFT JOIN departments department ON department.department_id = course.department_id
             WHERE certifier_courses.certifier_user_id = ?
             ORDER BY course.title, course.course_id`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

router.post('/certifier/:userId/courses', requireCourseEdit, async (req, res, next) => {
    const userId = Number(req.params.userId);
    const courseIds = req.body?.course_ids;
    if (!Number.isSafeInteger(userId) || userId < 1 || !Array.isArray(courseIds) || !courseIds.length || courseIds.length > 100 || courseIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1)) {
        return res.status(400).json({ success: false, message: 'Choose one or more valid learning courses.' });
    }
    const normalizedIds = [...new Set(courseIds.map(Number))];
    let connection;
    try {
        connection = await db.getConnection();
        const [certifiers] = await connection.execute('SELECT user_id FROM certifiers WHERE user_id = ?', [userId]);
        if (!certifiers.length) return res.status(404).json({ success: false, message: 'Certifier not found.' });
        const placeholders = normalizedIds.map(() => '?').join(', ');
        const [courses] = await connection.execute(`SELECT course_id FROM learning_courses WHERE course_id IN (${placeholders})`, normalizedIds);
        if (courses.length !== normalizedIds.length) return res.status(404).json({ success: false, message: 'One or more learning courses were not found.' });
        await connection.beginTransaction();
        await connection.query(
            `INSERT IGNORE INTO certifier_courses (certifier_user_id, course_id) VALUES ${normalizedIds.map(() => '(?, ?)').join(', ')}`,
            normalizedIds.flatMap((courseId) => [userId, courseId])
        );
        await connection.commit();
        res.json({ success: true, message: 'Learning courses added to the certifier portfolio.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        next(error);
    } finally {
        connection?.release();
    }
});

router.delete('/certifier/:userId/courses/:courseId', requireCourseEdit, async (req, res, next) => {
    const userId = Number(req.params.userId);
    const courseId = Number(req.params.courseId);
    if (![userId, courseId].every((id) => Number.isSafeInteger(id) && id > 0)) return res.status(400).json({ success: false, message: 'Invalid certifier or course ID.' });
    try {
        const [result] = await db.execute('DELETE FROM certifier_courses WHERE certifier_user_id = ? AND course_id = ?', [userId, courseId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Course was not found in this certifier portfolio.' });
        res.json({ success: true, message: 'Learning course removed from the certifier portfolio.' });
    } catch (error) { next(error); }
});

router.post('/mentor/:userId/courses', requireCourseEdit, async (req, res, next) => {
    const userId = Number(req.params.userId);
    const courseIds = req.body?.course_ids;
    if (!Number.isSafeInteger(userId) || userId < 1 || !Array.isArray(courseIds) || !courseIds.length || courseIds.length > 100 || courseIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1)) {
        return res.status(400).json({ success: false, message: 'Choose one or more valid learning courses.' });
    }
    const normalizedIds = [...new Set(courseIds.map(Number))];
    let connection;
    try {
        connection = await db.getConnection();
        const [mentors] = await connection.execute('SELECT user_id FROM mentors WHERE user_id = ?', [userId]);
        if (!mentors.length) return res.status(404).json({ success: false, message: 'Mentor not found.' });
        const placeholders = normalizedIds.map(() => '?').join(', ');
        const [courses] = await connection.execute(`SELECT course_id FROM learning_courses WHERE course_id IN (${placeholders})`, normalizedIds);
        if (courses.length !== normalizedIds.length) return res.status(404).json({ success: false, message: 'One or more learning courses were not found.' });
        await connection.beginTransaction();
        await connection.query(
            `INSERT IGNORE INTO mentor_courses (mentor_user_id, course_id) VALUES ${normalizedIds.map(() => '(?, ?)').join(', ')}`,
            normalizedIds.flatMap((courseId) => [userId, courseId])
        );
        await connection.commit();
        res.json({ success: true, message: 'Learning courses assigned to the mentor.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        next(error);
    } finally {
        connection?.release();
    }
});

router.delete('/mentor/:userId/courses/:courseId', requireCourseEdit, async (req, res, next) => {
    const userId = Number(req.params.userId);
    const courseId = Number(req.params.courseId);
    if (![userId, courseId].every((id) => Number.isSafeInteger(id) && id > 0)) return res.status(400).json({ success: false, message: 'Invalid mentor or course ID.' });
    try {
        const [result] = await db.execute('DELETE FROM mentor_courses WHERE mentor_user_id = ? AND course_id = ?', [userId, courseId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Course assignment not found.' });
        res.json({ success: true, message: 'Course removed from this mentor.' });
    } catch (error) { next(error); }
});

router.post('/:role', requireAdd, async (req, res, next) => {
    const role = String(req.params.role).toLowerCase();
    const userId = Number(req.body?.user_id);
    const table = roleTables[role];
    if (!table) return res.status(404).json({ success: false, message: 'Community role not found.' });
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ success: false, message: 'Choose a user account.' });
    try {
        const [users] = await db.execute('SELECT user_id FROM users WHERE user_id = ? AND is_active = TRUE', [userId]);
        if (!users.length) return res.status(404).json({ success: false, message: 'Active user account not found.' });
        await db.execute(`INSERT INTO ${table} (user_id) VALUES (?)`, [userId]);
        res.status(201).json({ success: true, message: 'Account added to the directory.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'This account is already in the directory.' });
        next(error);
    }
});

router.put('/:role/:userId', requireEdit, async (req, res, next) => {
    const role = String(req.params.role).toLowerCase();
    const currentId = Number(req.params.userId);
    const nextId = Number(req.body?.user_id);
    const table = roleTables[role];
    if (!table) return res.status(404).json({ success: false, message: 'Community role not found.' });
    if (![currentId, nextId].every((id) => Number.isSafeInteger(id) && id > 0)) return res.status(400).json({ success: false, message: 'Choose a valid user account.' });
    try {
        const [existing] = await db.execute(
            `SELECT user_id FROM ${table} WHERE user_id = ?`,
            [currentId]
        );
        if (!existing.length) return res.status(404).json({ success: false, message: 'Directory entry not found.' });
        if (nextId === currentId) return res.json({ success: true, message: 'Directory entry updated.' });
        const [activeUser] = await db.execute('SELECT user_id FROM users WHERE user_id = ? AND is_active = TRUE', [nextId]);
        if (!activeUser.length) return res.status(404).json({ success: false, message: 'Active user account not found.' });
        const [result] = await db.execute(
            `UPDATE ${table} SET user_id = ? WHERE user_id = ?`,
            [nextId, currentId]
        );
        if (!result.affectedRows) return res.status(409).json({ success: false, message: 'Directory entry could not be updated.' });
        res.json({ success: true, message: 'Directory entry updated.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'This account is already in the directory.' });
        if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ success: false, message: 'User account not found.' });
        next(error);
    }
});

router.delete('/:role/:userId', requireDelete, async (req, res, next) => {
    const role = String(req.params.role).toLowerCase();
    const userId = Number(req.params.userId);
    const table = roleTables[role];
    if (!table) return res.status(404).json({ success: false, message: 'Community role not found.' });
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    try {
        const [result] = await db.execute(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Directory entry not found.' });
        res.json({ success: true, message: 'Account removed from the directory.' });
    } catch (error) { next(error); }
});

module.exports = router;
