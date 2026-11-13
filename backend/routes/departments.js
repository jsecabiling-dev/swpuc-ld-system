const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

async function authenticateToken(req, res, next) {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';
    if (!token) return res.status(401).json({ success: false, message: 'Sign in to continue.' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await db.execute(
            `SELECT u.user_id, u.must_change_password, u.active_session_id, u.can_add_courses, u.can_edit_courses
             FROM users u
             WHERE u.user_id = ? AND u.is_active = TRUE`,
            [payload.userId]
        );
        if (!users.length) {
            return res.status(401).json({ success: false, message: 'Your account is inactive or no longer exists.' });
        }
        if (!payload.sessionId || users[0].active_session_id !== payload.sessionId) {
            return res.status(401).json({ success: false, message: 'You signed in from another browser or device. Please sign in again.' });
        }
        if (users[0].must_change_password) {
            return res.status(403).json({ success: false, message: 'Change your password before using this feature.' });
        }
        req.auth = users[0];
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Your session is invalid or expired. Please sign in again.' });
        }
        next(error);
    }
}

const requireCourseAdd = requirePermission('courses.add');
const requireCourseEdit = requirePermission('courses.edit');

router.use(authenticateToken);

router.get('/', async (req, res, next) => {
    try {
        const [departments] = await db.execute(
            `SELECT department.department_id, department.name, department.description,
                    department.created_at, department.updated_at
             FROM departments department
             ORDER BY department.name, department.department_id`
        );
        res.json({ success: true, data: departments });
    } catch (error) {
        next(error);
    }
});

router.post('/', requireCourseAdd, async (req, res, next) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';

    if (!name || name.length > 150) {
        return res.status(400).json({ success: false, message: 'Department name is required and must be 150 characters or fewer.' });
    }
    if (description.length > 20000) {
        return res.status(400).json({ success: false, message: 'Department description must be 20,000 characters or fewer.' });
    }
    try {
        const [result] = await db.execute(
            `INSERT INTO departments (name, description, created_by)
             VALUES (?, ?, ?)`,
            [name, description || null, req.auth.user_id]
        );
        const [created] = await db.execute(
            `SELECT department.department_id, department.name, department.description,
                    department.created_at, department.updated_at
             FROM departments department
             WHERE department.department_id = ?`,
            [result.insertId]
        );
        res.status(201).json({ success: true, message: 'Department created successfully.', data: created[0] });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'A department with this name already exists.' });
        }
        next(error);
    }
});

router.put('/:id', requireCourseEdit, async (req, res, next) => {
    const departmentId = Number(req.params.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';

    if (!Number.isSafeInteger(departmentId) || departmentId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid department ID.' });
    }
    if (!name || name.length > 150) {
        return res.status(400).json({ success: false, message: 'Department name is required and must be 150 characters or fewer.' });
    }
    if (description.length > 20000) {
        return res.status(400).json({ success: false, message: 'Department description must be 20,000 characters or fewer.' });
    }
    try {
        const [existing] = await db.execute('SELECT department_id FROM departments WHERE department_id = ?', [departmentId]);
        if (!existing.length) return res.status(404).json({ success: false, message: 'Department not found.' });

        await db.execute(
            `UPDATE departments SET name = ?, description = ? WHERE department_id = ?`,
            [name, description || null, departmentId]
        );
        const [updated] = await db.execute(
            `SELECT department.department_id, department.name, department.description,
                    department.created_at, department.updated_at
             FROM departments department WHERE department.department_id = ?`,
            [departmentId]
        );
        res.json({ success: true, message: 'Department updated successfully.', data: updated[0] });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'A department with this name already exists.' });
        }
        next(error);
    }
});

module.exports = router;
