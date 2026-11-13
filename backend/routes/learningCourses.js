const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');

const router = express.Router();
async function authenticateToken(req, res, next) {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';

    if (!token) {
        return res.status(401).json({ success: false, message: 'Sign in to continue.' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await db.execute(
            `SELECT u.user_id, u.must_change_password, u.active_session_id,
                    u.can_add_courses, u.can_edit_courses, u.can_delete_courses
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
const requireCourseDelete = requirePermission('courses.delete');

router.use(authenticateToken);

router.get('/options', requireAnyPermission('courses.add', 'courses.edit'), async (req, res, next) => {
    try {
        const [departments] = await db.execute('SELECT department_id, name FROM departments ORDER BY name');
        res.json({ success: true, data: { departments } });
    } catch (error) {
        next(error);
    }
});

router.get('/', async (req, res, next) => {
    try {
        const [courses] = await db.execute(
            `SELECT course.course_id, course.title, course.learning_level, course.department_id,
                    department.name AS department_name, course.created_at, course.updated_at
             FROM learning_courses course
             LEFT JOIN departments department ON department.department_id = course.department_id
             ORDER BY course.created_at DESC, course.course_id DESC`
        );
        res.json({ success: true, data: courses });
    } catch (error) {
        next(error);
    }
});

router.get('/:id/accreditations', async (req, res, next) => {
    const courseId = Number(req.params.id);
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }

    try {
        const [courses] = await db.execute('SELECT course_id FROM learning_courses WHERE course_id = ?', [courseId]);
        if (!courses.length) {
            return res.status(404).json({ success: false, message: 'Learning course not found.' });
        }

        const [[mentors], [certifiers]] = await Promise.all([
            db.execute(
                `SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.suffix, u.email, u.profilepict,
                        o.name AS institution_name
                 FROM mentor_courses mc
                 JOIN mentors m ON m.user_id = mc.mentor_user_id
                 JOIN users u ON u.user_id = m.user_id
                 LEFT JOIN organizational_units o ON o.unit_id = u.unit_id
                 WHERE mc.course_id = ? AND u.is_active = TRUE
                 ORDER BY u.last_name, u.first_name, u.user_id`,
                [courseId]
            ),
            db.execute(
                `SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.suffix, u.email, u.profilepict,
                        o.name AS institution_name
                 FROM certifier_courses cc
                 JOIN certifiers c ON c.user_id = cc.certifier_user_id
                 JOIN users u ON u.user_id = c.user_id
                 LEFT JOIN organizational_units o ON o.unit_id = u.unit_id
                 WHERE cc.course_id = ? AND u.is_active = TRUE
                 ORDER BY u.last_name, u.first_name, u.user_id`,
                [courseId]
            ),
        ]);
        res.json({ success: true, data: { mentors, certifiers } });
    } catch (error) {
        next(error);
    }
});

router.put('/:id', requireCourseEdit, async (req, res, next) => {
    const courseId = Number(req.params.id);
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const learningLevel = typeof body.learning_level === 'string' ? body.learning_level.trim() : '';
    const departmentId = Number(body.department_id);

    if (!Number.isSafeInteger(courseId) || courseId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }
    if (!title || title.length > 200) {
        return res.status(400).json({ success: false, message: 'Course title is required and must be 200 characters or fewer.' });
    }
    if (!learningLevel || learningLevel.length > 100) {
        return res.status(400).json({ success: false, message: 'Learning level is required and must be 100 characters or fewer.' });
    }
    if (!Number.isSafeInteger(departmentId) || departmentId < 1) {
        return res.status(400).json({ success: false, message: 'Choose the department hosting this course.' });
    }

    try {
        const [departments] = await db.execute('SELECT department_id FROM departments WHERE department_id = ?', [departmentId]);
        if (!departments.length) {
            return res.status(400).json({ success: false, message: 'The selected department does not exist.' });
        }

        const [result] = await db.execute(
            'UPDATE learning_courses SET title = ?, learning_level = ?, department_id = ? WHERE course_id = ?',
            [title, learningLevel, departmentId, courseId]
        );
        if (!result.affectedRows) {
            const [existing] = await db.execute('SELECT course_id FROM learning_courses WHERE course_id = ?', [courseId]);
            if (!existing.length) return res.status(404).json({ success: false, message: 'Learning course not found.' });
        }
        const [courses] = await db.execute(
            `SELECT course.course_id, course.title, course.learning_level, course.department_id,
                    department.name AS department_name, course.created_at, course.updated_at
             FROM learning_courses course
             LEFT JOIN departments department ON department.department_id = course.department_id
             WHERE course.course_id = ?`,
            [courseId]
        );
        res.json({ success: true, message: 'Learning course updated successfully.', data: courses[0] });
    } catch (error) {
        next(error);
    }
});

router.post('/', requireCourseAdd, async (req, res, next) => {
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const learningLevel = typeof body.learning_level === 'string' ? body.learning_level.trim() : '';
    const departmentId = Number(body.department_id);

    if (!title || title.length > 200) {
        return res.status(400).json({ success: false, message: 'Course title is required and must be 200 characters or fewer.' });
    }
    if (!learningLevel || learningLevel.length > 100) {
        return res.status(400).json({ success: false, message: 'Learning level is required and must be 100 characters or fewer.' });
    }
    if (!Number.isSafeInteger(departmentId) || departmentId < 1) {
        return res.status(400).json({ success: false, message: 'Choose the department hosting this course.' });
    }

    try {
        const [departments] = await db.execute('SELECT department_id FROM departments WHERE department_id = ?', [departmentId]);
        if (!departments.length) {
            return res.status(400).json({ success: false, message: 'The selected department does not exist.' });
        }

        const [result] = await db.execute(
            'INSERT INTO learning_courses (title, learning_level, department_id, created_by) VALUES (?, ?, ?, ?)',
            [title, learningLevel, departmentId, req.auth.user_id]
        );
        const [courses] = await db.execute(
            `SELECT course.course_id, course.title, course.learning_level, course.department_id,
                    department.name AS department_name, course.created_at
             FROM learning_courses course
             LEFT JOIN departments department ON department.department_id = course.department_id
             WHERE course.course_id = ?`,
            [result.insertId]
        );
        res.status(201).json({ success: true, message: 'Learning course registered successfully.', data: courses[0] });
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', requireCourseDelete, async (req, res, next) => {
    const courseId = Number(req.params.id);
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }

    try {
        const [result] = await db.execute('DELETE FROM learning_courses WHERE course_id = ?', [courseId]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Learning course not found.' });
        }
        res.json({ success: true, message: 'Learning course deleted.' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({ success: false, message: 'This course cannot be deleted while learning events are linked to it.' });
        }
        next(error);
    }
});

module.exports = router;
