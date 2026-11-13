const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');

const router = express.Router();
const DELIVERY_MODES = ['In_Person', 'Online', 'Hybrid'];

async function authenticateToken(req, res, next) {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';
    if (!token) return res.status(401).json({ success: false, message: 'Sign in to continue.' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await db.execute(
            `SELECT u.user_id, u.must_change_password, u.active_session_id,
                    u.can_add_events, u.can_edit_events, u.can_delete_events
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

const requireEventAdd = requirePermission('events.add');
const requireEventEdit = requirePermission('events.edit');
const requireEventDelete = requirePermission('events.delete');

function isValidDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseEvent(body = {}) {
    const courseId = Number(body.course_id);
    const institutionId = Number(body.institution_id);
    const departmentId = body.department_id === '' || body.department_id === null || body.department_id === undefined
        ? null
        : Number(body.department_id);
    const startDate = typeof body.start_date === 'string' ? body.start_date : '';
    const endDate = typeof body.end_date === 'string' && body.end_date ? body.end_date : null;
    const venue = typeof body.venue === 'string' ? body.venue.trim() : '';
    const deliveryMode = typeof body.delivery_mode === 'string' ? body.delivery_mode : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const mentorIds = parseAccountIds(body.mentor_ids);
    const certifierIds = parseAccountIds(body.certifier_ids);
    if (!mentorIds || !certifierIds) return { error: 'Choose valid mentor and certifier accounts.' };

    if (!Number.isSafeInteger(institutionId) || institutionId < 1) {
        return { error: 'Choose an offering institution.' };
    }
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
        return { error: 'Choose a course from the course catalog.' };
    }
    if (departmentId !== null && (!Number.isSafeInteger(departmentId) || departmentId < 1)) {
        return { error: 'Choose a valid department.' };
    }
    if (!isValidDate(startDate) || (endDate && !isValidDate(endDate))) {
        return { error: 'Enter a valid event start and end date.' };
    }
    if (endDate && endDate < startDate) {
        return { error: 'The event end date cannot be before its start date.' };
    }
    if (venue.length > 255 || description.length > 20000) {
        return { error: 'Venue or description exceeds the allowed length.' };
    }
    if (!DELIVERY_MODES.includes(deliveryMode)) {
        return { error: 'Choose a valid delivery mode.' };
    }

    return {
        data: {
            courseId,
            institutionId,
            departmentId,
            startDate,
            endDate,
            venue: venue || null,
            deliveryMode,
            description: description || null,
            mentorIds,
            certifierIds,
        },
    };
}

function parseAccountIds(value) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) return null;
    const ids = value.map(Number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return null;
    return [...new Set(ids)];
}

async function saveEventPeople(connection, eventId, courseId, mentorIds, certifierIds) {
    const [mentors] = await connection.execute(
        `SELECT mentor_user_id AS user_id FROM mentor_courses
         WHERE course_id = ? AND mentor_user_id IN (${mentorIds.length ? mentorIds.map(() => '?').join(', ') : 'NULL'})`,
        [courseId, ...mentorIds]
    );
    const [certifiers] = await connection.execute(
        `SELECT certifier_user_id AS user_id FROM certifier_courses
         WHERE course_id = ? AND certifier_user_id IN (${certifierIds.length ? certifierIds.map(() => '?').join(', ') : 'NULL'})`,
        [courseId, ...certifierIds]
    );
    if (mentors.length !== mentorIds.length || certifiers.length !== certifierIds.length) {
        throw Object.assign(new Error('A selected mentor or certifier account is no longer available.'), { status: 400 });
    }
    await connection.execute('DELETE FROM learning_event_mentors WHERE event_id = ?', [eventId]);
    await connection.execute('DELETE FROM learning_event_certifiers WHERE event_id = ?', [eventId]);
    if (mentorIds.length) {
        await connection.execute(
            `INSERT INTO learning_event_mentors (event_id, mentor_user_id) VALUES ${mentorIds.map(() => '(?, ?)').join(', ')}`,
            mentorIds.flatMap((id) => [eventId, id])
        );
    }
    if (certifierIds.length) {
        await connection.execute(
            `INSERT INTO learning_event_certifiers (event_id, certifier_user_id) VALUES ${certifierIds.map(() => '(?, ?)').join(', ')}`,
            certifierIds.flatMap((id) => [eventId, id])
        );
    }
}

const EVENT_LIST_QUERY = `
    SELECT learning_event.event_id, course.title AS title,
           course.learning_level AS learning_level,
           learning_event.course_id, course.title AS course_title,
           course.learning_level AS course_level,
           course_department.name AS course_department_name,
           learning_event.institution_id, institution.name AS institution_name,
           learning_event.department_id, department.name AS department_name,
           learning_event.start_date, learning_event.end_date, learning_event.venue, learning_event.delivery_mode,
           learning_event.status,
           learning_event.description, learning_event.created_at, learning_event.updated_at
    FROM learning_events learning_event
    LEFT JOIN learning_courses course ON course.course_id = learning_event.course_id
    JOIN organizational_units institution ON institution.unit_id = learning_event.institution_id
    LEFT JOIN departments department ON department.department_id = learning_event.department_id
    LEFT JOIN departments course_department ON course_department.department_id = course.department_id
`;

router.use(authenticateToken);

router.get('/options', requireAnyPermission('events.add', 'events.edit'), async (req, res, next) => {
    try {
        const [[courses], [institutions], [departments]] = await Promise.all([
            db.execute('SELECT course_id, title, learning_level FROM learning_courses ORDER BY title'),
            db.execute('SELECT unit_id, name, unit_type FROM organizational_units ORDER BY name'),
            db.execute('SELECT department_id, name FROM departments ORDER BY name'),
        ]);
        res.json({ success: true, data: { courses, institutions, departments } });
    } catch (error) {
        next(error);
    }
});

router.get('/people', requireAnyPermission('events.add', 'events.edit'), async (req, res, next) => {
    const courseId = Number(req.query.course_id);
    if (!Number.isSafeInteger(courseId) || courseId < 1) {
        return res.status(400).json({ success: false, message: 'Choose a valid learning catalog course.' });
    }
    try {
        const [[courses], [mentors], [certifiers]] = await Promise.all([
            db.execute('SELECT course_id FROM learning_courses WHERE course_id = ?', [courseId]),
            db.execute(`SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.suffix, u.email
                        FROM mentor_courses mc JOIN mentors m ON m.user_id = mc.mentor_user_id
                        JOIN users u ON u.user_id = m.user_id
                        WHERE mc.course_id = ? AND u.is_active = TRUE
                        ORDER BY u.last_name, u.first_name, u.user_id`, [courseId]),
            db.execute(`SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.suffix, u.email
                        FROM certifier_courses cc JOIN certifiers c ON c.user_id = cc.certifier_user_id
                        JOIN users u ON u.user_id = c.user_id
                        WHERE cc.course_id = ? AND u.is_active = TRUE
                        ORDER BY u.last_name, u.first_name, u.user_id`, [courseId]),
        ]);
        if (!courses.length) return res.status(404).json({ success: false, message: 'The selected course does not exist in the catalog.' });
        res.json({ success: true, data: { mentors, certifiers } });
    } catch (error) {
        next(error);
    }
});

router.get('/', async (req, res, next) => {
    try {
        const [events] = await db.execute(`${EVENT_LIST_QUERY} ORDER BY learning_event.start_date DESC, learning_event.event_id DESC`);
        if (events.length) {
            const ids = events.map((event) => event.event_id);
            const placeholders = ids.map(() => '?').join(', ');
            const [[mentorLinks], [certifierLinks]] = await Promise.all([
                db.execute(`SELECT m.event_id, m.mentor_user_id AS user_id, u.first_name, u.last_name
                            FROM learning_event_mentors m JOIN users u ON u.user_id = m.mentor_user_id
                            WHERE m.event_id IN (${placeholders})`, ids),
                db.execute(`SELECT c.event_id, c.certifier_user_id AS user_id, u.first_name, u.last_name
                            FROM learning_event_certifiers c JOIN users u ON u.user_id = c.certifier_user_id
                            WHERE c.event_id IN (${placeholders})`, ids),
            ]);
            const mentorsByEvent = new Map();
            const certifiersByEvent = new Map();
            mentorLinks.forEach((person) => mentorsByEvent.set(person.event_id, [...(mentorsByEvent.get(person.event_id) || []), person]));
            certifierLinks.forEach((person) => certifiersByEvent.set(person.event_id, [...(certifiersByEvent.get(person.event_id) || []), person]));
            events.forEach((event) => {
                event.mentors = mentorsByEvent.get(event.event_id) || [];
                event.certifiers = certifiersByEvent.get(event.event_id) || [];
            });
        }
        res.json({ success: true, data: events });
    } catch (error) {
        next(error);
    }
});

router.get('/:id', async (req, res, next) => {
    const eventId = Number(req.params.id);
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid learning event ID.' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT learning_event.event_id, course.title AS title,
                    course.learning_level AS learning_level,
                    learning_event.course_id, course.title AS course_title,
                    course.learning_level AS course_level,
                    course_department.name AS course_department_name,
                    learning_event.institution_id, institution.name AS institution_name,
                    learning_event.department_id, department.name AS department_name,
                    learning_event.start_date, learning_event.end_date,
                    learning_event.venue, learning_event.delivery_mode, learning_event.status,
                    learning_event.description, learning_event.created_at,
                    participation.participation_id, participation.user_id,
                    participation.attended, participation.completed, participation.certified,
                    participation.certificate_number, participation.certification_date,
                    participation.certificate_verification_code,
                    person.first_name, person.middle_name, person.last_name,
                    person.suffix, person.email, person.phone_number,
                    person.profilepict, person.is_active,
                    participant_institution.name AS participant_institution
             FROM learning_events learning_event
             LEFT JOIN learning_courses course ON course.course_id = learning_event.course_id
             JOIN organizational_units institution ON institution.unit_id = learning_event.institution_id
             LEFT JOIN departments department ON department.department_id = learning_event.department_id
             LEFT JOIN departments course_department ON course_department.department_id = course.department_id
             LEFT JOIN learning_participations participation ON participation.event_id = learning_event.event_id
             LEFT JOIN users person ON person.user_id = participation.user_id
             LEFT JOIN organizational_units participant_institution ON participant_institution.unit_id = person.unit_id
             WHERE learning_event.event_id = ?
             ORDER BY person.last_name, person.first_name, participation.participation_id`,
            [eventId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: 'Learning event not found.' });

        const [[mentorRows], [certifierRows]] = await Promise.all([
            db.execute(`SELECT m.mentor_user_id AS user_id, u.first_name, u.middle_name, u.last_name, u.suffix, u.email
                        FROM learning_event_mentors m JOIN users u ON u.user_id = m.mentor_user_id
                        WHERE m.event_id = ? ORDER BY u.last_name, u.first_name`, [eventId]),
            db.execute(`SELECT c.certifier_user_id AS user_id, u.first_name, u.middle_name, u.last_name, u.suffix, u.email
                        FROM learning_event_certifiers c JOIN users u ON u.user_id = c.certifier_user_id
                        WHERE c.event_id = ? ORDER BY u.last_name, u.first_name`, [eventId]),
        ]);

        const firstRow = rows[0];
        const event = {
            event_id: firstRow.event_id,
            title: firstRow.title,
            learning_level: firstRow.learning_level,
            course_id: firstRow.course_id,
            course_title: firstRow.course_title,
            course_level: firstRow.course_level,
            course_department_name: firstRow.course_department_name,
            institution_id: firstRow.institution_id,
            institution_name: firstRow.institution_name,
            department_id: firstRow.department_id,
            department_name: firstRow.department_name,
            start_date: firstRow.start_date,
            end_date: firstRow.end_date,
            venue: firstRow.venue,
            delivery_mode: firstRow.delivery_mode,
            status: firstRow.status,
            description: firstRow.description,
            created_at: firstRow.created_at,
            mentors: mentorRows,
            certifiers: certifierRows,
        };
        const participants = rows
            .filter((row) => row.participation_id !== null)
            .map((row) => ({
                participation_id: row.participation_id,
                user_id: row.user_id,
                attended: row.attended,
                completed: row.completed,
                certified: row.certified,
                certificate_number: row.certificate_number,
                certification_date: row.certification_date,
                certificate_verification_code: row.certificate_verification_code,
                first_name: row.first_name,
                middle_name: row.middle_name,
                last_name: row.last_name,
                suffix: row.suffix,
                email: row.email,
                phone_number: row.phone_number,
                profilepict: row.profilepict,
                is_active: row.is_active,
                unit_name: row.participant_institution,
            }));

        res.json({ success: true, data: { event, participants } });
    } catch (error) {
        next(error);
    }
});

router.post('/', requireEventAdd, async (req, res, next) => {
    const parsed = parseEvent(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    let connection;
    try {
        const [courses] = await db.execute(
            'SELECT course_id FROM learning_courses WHERE course_id = ?',
            [parsed.data.courseId]
        );
        if (!courses.length) return res.status(400).json({ success: false, message: 'The selected course does not exist in the catalog.' });

        connection = await db.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.execute(
            `INSERT INTO learning_events
                (course_id, institution_id, department_id, start_date, end_date,
                 venue, delivery_mode, description, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                parsed.data.courseId,
                parsed.data.institutionId,
                parsed.data.departmentId,
                parsed.data.startDate,
                parsed.data.endDate,
                parsed.data.venue,
                parsed.data.deliveryMode,
                parsed.data.description,
                req.auth.user_id,
            ]
        );
        await saveEventPeople(connection, result.insertId, parsed.data.courseId, parsed.data.mentorIds, parsed.data.certifierIds);
        await connection.commit();
        connection.release();
        connection = null;
        res.status(201).json({ success: true, event_id: result.insertId, message: 'Learning event proposal submitted.' });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
            connection.release();
        }
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ success: false, message: 'One of the selected related records does not exist.' });
        }
        next(error);
    }
});

router.put('/:id', requireEventEdit, async (req, res, next) => {
    const eventId = Number(req.params.id);
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid learning event ID.' });
    }
    const parsed = parseEvent(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    let connection;
    try {
        const [courses] = await db.execute(
            'SELECT course_id FROM learning_courses WHERE course_id = ?',
            [parsed.data.courseId]
        );
        if (!courses.length) return res.status(400).json({ success: false, message: 'The selected course does not exist in the catalog.' });

        connection = await db.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.execute(
            `UPDATE learning_events
             SET course_id = ?, institution_id = ?, department_id = ?,
                 start_date = ?, end_date = ?, venue = ?, delivery_mode = ?, description = ?
             WHERE event_id = ?`,
            [
                parsed.data.courseId,
                parsed.data.institutionId,
                parsed.data.departmentId,
                parsed.data.startDate,
                parsed.data.endDate,
                parsed.data.venue,
                parsed.data.deliveryMode,
                parsed.data.description,
                eventId,
            ]
        );
        await saveEventPeople(connection, eventId, parsed.data.courseId, parsed.data.mentorIds, parsed.data.certifierIds);
        await connection.commit();
        connection.release();
        connection = null;
        if (!result.affectedRows) {
            const [existing] = await db.execute('SELECT event_id FROM learning_events WHERE event_id = ?', [eventId]);
            if (!existing.length) return res.status(404).json({ success: false, message: 'Learning event not found.' });
        }
        res.json({ success: true, message: 'Learning event updated.' });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
            connection.release();
        }
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ success: false, message: 'One of the selected related records does not exist.' });
        }
        next(error);
    }
});

router.patch('/:id/status', requireEventEdit, async (req, res, next) => {
    const eventId = Number(req.params.id);
    const nextStatus = req.body?.status;
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid learning event ID.' });
    }
    const allowedNextStatuses = {
        Submitted: ['For evaluation'],
        'For evaluation': ['Approved', 'Rejected'],
        Approved: [],
        Rejected: ['For evaluation'],
    };
    if (!Object.values(allowedNextStatuses).flat().includes(nextStatus)) {
        return res.status(400).json({ success: false, message: 'Choose a valid next proposal status.' });
    }

    try {
        const [events] = await db.execute('SELECT status FROM learning_events WHERE event_id = ?', [eventId]);
        if (!events.length) return res.status(404).json({ success: false, message: 'Learning event not found.' });
        const currentStatus = events[0].status;
        if (!allowedNextStatuses[currentStatus]?.includes(nextStatus)) {
            return res.status(409).json({ success: false, message: `A proposal with status “${currentStatus}” cannot be changed to “${nextStatus}”.` });
        }
        const isRevertingRejection = currentStatus === 'Rejected' && nextStatus === 'For evaluation';
        const [result] = isRevertingRejection
            ? await db.execute(
                `UPDATE learning_events SET status = ?
                 WHERE event_id = ? AND status = 'Rejected' AND start_date > CURRENT_DATE`,
                [nextStatus, eventId]
            )
            : await db.execute(
                'UPDATE learning_events SET status = ? WHERE event_id = ? AND status = ?',
                [nextStatus, eventId, currentStatus]
            );
        if (!result.affectedRows) return res.status(409).json({ success: false, message: isRevertingRejection ? 'A rejected proposal can only be reverted before its start date.' : 'The proposal status changed. Refresh and try again.' });
        res.json({ success: true, status: nextStatus, message: 'Proposal status updated.' });
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', requireEventDelete, async (req, res, next) => {
    const eventId = Number(req.params.id);
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid learning event ID.' });
    }

    try {
        const [participations] = await db.execute(
            'SELECT participation_id FROM learning_participations WHERE event_id = ? LIMIT 1',
            [eventId]
        );
        if (participations.length) {
            return res.status(409).json({ success: false, message: 'This event has participant records and cannot be deleted.' });
        }
        const [result] = await db.execute('DELETE FROM learning_events WHERE event_id = ?', [eventId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Learning event not found.' });
        res.json({ success: true, message: 'Learning event deleted.' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({ success: false, message: 'This event is linked to existing records and cannot be deleted.' });
        }
        next(error);
    }
});

module.exports = router;
