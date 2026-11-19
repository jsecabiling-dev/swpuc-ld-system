const express = require('express');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const db = require('../config/db');
const { requirePermission } = require('../middleware/permissions');

const { deliveryLabelSql } = require('../utils/learningEventCodes');

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
                    u.can_add_progress, u.can_edit_progress, u.can_delete_progress
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

const requireProgressAdd = requirePermission('progress.add');
const requireProgressEdit = requirePermission('progress.edit');
const requireProgressDelete = requirePermission('progress.delete');

async function requireEventCertifier(req, res, participationId) {
    const [records] = await db.execute(
        `SELECT participation.event_id,
                EXISTS (
                    SELECT 1
                    FROM learning_event_certifiers certifier
                    WHERE certifier.event_id = participation.event_id
                      AND certifier.certifier_user_id = ?
                ) AS is_certifier
         FROM learning_participations participation
         WHERE participation.participation_id = ?`,
        [req.auth.user_id, participationId]
    );
    if (!records.length) {
        res.status(404).json({ success: false, message: 'Participant record not found.' });
        return false;
    }
    return Boolean(records[0].is_certifier);
}

function rejectNonCertifier(res) {
    return res.status(403).json({ success: false, message: 'Only a certifier assigned to this learning event can update learner progress.' });
}

async function nextCertificateNumber() {
    const connection = await db.getConnection();
    try {
        const [[period]] = await connection.execute("SELECT DATE_FORMAT(CURRENT_DATE, '%Y-%m') AS period_key");
        await connection.execute(
            `INSERT INTO certificate_number_sequences (period_key, last_series)
             VALUES (?, LAST_INSERT_ID(1))
             ON DUPLICATE KEY UPDATE last_series = LAST_INSERT_ID(last_series + 1)`,
            [period.period_key]
        );
        const [[sequence]] = await connection.execute('SELECT LAST_INSERT_ID() AS series');
        return `${period.period_key}-${String(sequence.series).padStart(6, '0')}`;
    } finally {
        connection.release();
    }
}

function parseParticipation(body = {}) {
    const userId = Number(body.user_id);
    const eventId = Number(body.event_id);
    const certificateNumber = typeof body.certificate_number === 'string' ? body.certificate_number.trim() : '';
    const certificationDate = typeof body.certification_date === 'string' ? body.certification_date.trim() : '';

    if (!Number.isSafeInteger(userId) || userId < 1) {
        return { error: 'Choose a valid user.' };
    }
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
        return { error: 'Choose a valid learning event.' };
    }
    if (certificateNumber.length > 100) {
        return { error: 'Certificate number is too long.' };
    }
    if (certificationDate && !/^\d{4}-\d{2}-\d{2}$/.test(certificationDate)) {
        return { error: 'Enter a valid certification date.' };
    }

    return {
        data: {
            userId,
            eventId,
            certificateNumber: certificateNumber || null,
            certificationDate: certificationDate || null,
        },
    };
}

router.use(authenticateToken);

router.get('/', async (req, res, next) => {
    try {
        const [records] = await db.execute(
            `SELECT participation.participation_id, participation.user_id,
                    participation.event_id, learning_course.title AS event_name,
                    learning_course.title AS course_title,
                    learning_course.learning_level AS learning_level,
                    learning_event.start_date, learning_event.end_date, learning_event.venue,
                    ${deliveryLabelSql('learning_event.delivery_mode')} AS delivery_mode, event_institution.name AS offering_institution,
                    participation.attended,
                    participation.completed, participation.certified,
                    participation.certificate_number, participation.certification_date,
                    participation.certificate_verification_code,
                    participation.created_at, participation.updated_at,
                    person.first_name, person.middle_name, person.last_name, person.suffix,
                    person.email, person.phone_number, person.profilepict, person.is_active,
                    institution.name AS unit_name, participation.created_by
             FROM learning_participations participation
             JOIN users person ON person.user_id = participation.user_id
             JOIN organizational_units institution ON institution.unit_id = person.unit_id
             JOIN learning_events learning_event ON learning_event.event_id = participation.event_id
             LEFT JOIN learning_courses learning_course ON learning_course.course_id = learning_event.course_id
             LEFT JOIN organizational_units event_institution ON event_institution.unit_id = learning_event.institution_id
             ORDER BY participation.participation_id DESC`
        );
        res.json({ success: true, data: records });
    } catch (error) {
        next(error);
    }
});

router.post('/', requireProgressAdd, async (req, res, next) => {
    const parsed = parseParticipation(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    try {
        const [events] = await db.execute(
            `SELECT learning_event.event_id
             FROM learning_events learning_event
             WHERE learning_event.event_id = ? AND learning_event.status = 3`,
            [parsed.data.eventId]
        );
        if (!events.length) return res.status(400).json({ success: false, message: 'Participants can only be registered for an approved learning event.' });
        const [duplicates] = await db.execute(
            `SELECT participation_id FROM learning_participations
             WHERE user_id = ? AND event_id = ? LIMIT 1`,
            [parsed.data.userId, parsed.data.eventId]
        );
        if (duplicates.length) {
            return res.status(409).json({ success: false, message: 'This user is already registered for the event.' });
        }
        const [result] = await db.execute(
            `INSERT INTO learning_participations
                (user_id, event_id, certificate_number, certification_date, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [
                parsed.data.userId,
                parsed.data.eventId,
                parsed.data.certificateNumber,
                parsed.data.certificationDate,
                req.auth.user_id,
            ]
        );
        res.status(201).json({ success: true, participation_id: result.insertId, message: 'Learning record added.' });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ success: false, message: 'The selected user no longer exists.' });
        }
        next(error);
    }
});

router.put('/:id', requireProgressEdit, async (req, res, next) => {
    const participationId = Number(req.params.id);
    if (!Number.isSafeInteger(participationId) || participationId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid learning record ID.' });
    }

    const parsed = parseParticipation(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    try {
        const isCertifier = await requireEventCertifier(req, res, participationId);
        if (res.headersSent) return;
        if (!isCertifier) return rejectNonCertifier(res);
        const [events] = await db.execute(
            `SELECT learning_event.event_id
             FROM learning_events learning_event
             WHERE learning_event.event_id = ? AND learning_event.status = 3`,
            [parsed.data.eventId]
        );
        if (!events.length) return res.status(400).json({ success: false, message: 'Learning records can only be assigned to an approved event.' });
        const [result] = await db.execute(
            `UPDATE learning_participations
             SET user_id = ?, event_id = ?, certificate_number = ?, certification_date = ?
             WHERE participation_id = ?`,
            [
                parsed.data.userId,
                parsed.data.eventId,
                parsed.data.certificateNumber,
                parsed.data.certificationDate,
                participationId,
            ]
        );
        if (!result.affectedRows) {
            const [existing] = await db.execute(
                'SELECT participation_id FROM learning_participations WHERE participation_id = ?',
                [participationId]
            );
            if (!existing.length) {
                return res.status(404).json({ success: false, message: 'Learning record not found.' });
            }
        }
        res.json({ success: true, message: 'Learning record updated.' });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ success: false, message: 'The selected user no longer exists.' });
        }
        next(error);
    }
});

router.patch('/:id/status', requireProgressEdit, async (req, res, next) => {
    const participationId = Number(req.params.id);
    if (!Number.isSafeInteger(participationId) || participationId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid participant record ID.' });
    }

    const { attended, completed, certified } = req.body || {};
    if ([attended, completed, certified].some((value) => typeof value !== 'boolean')) {
        return res.status(400).json({ success: false, message: 'Provide valid attended, completed, and certified statuses.' });
    }
    if (completed && !attended) {
        return res.status(400).json({ success: false, message: 'A participant must be marked attended before completed.' });
    }
    if (certified && !completed) {
        return res.status(400).json({ success: false, message: 'A participant must be marked completed before certified.' });
    }

    try {
        const verificationCode = certified ? randomBytes(24).toString('hex') : null;
        const certificateNumber = certified ? await nextCertificateNumber() : null;
        const [result] = await db.execute(
            `UPDATE learning_participations
             SET attended = ?, completed = ?, certified = ?,
                 certificate_verification_code = IF(?, COALESCE(certificate_verification_code, ?), NULL),
                 certificate_number = IF(?, COALESCE(certificate_number, ?), NULL),
                 certification_date = IF(?, COALESCE(certification_date, CURRENT_DATE), NULL)
             WHERE participation_id = ?
               AND EXISTS (
                   SELECT 1 FROM learning_event_certifiers certifier
                   WHERE certifier.event_id = learning_participations.event_id
                     AND certifier.certifier_user_id = ?
               )`,
            [attended, completed, certified, certified, verificationCode, certified, certificateNumber, certified, participationId, req.auth.user_id]
        );
        if (!result.affectedRows) {
            const [authorized] = await db.execute(
                `SELECT 1 FROM learning_participations participation
                 JOIN learning_event_certifiers certifier ON certifier.event_id = participation.event_id
                 WHERE participation.participation_id = ? AND certifier.certifier_user_id = ?`,
                [participationId, req.auth.user_id]
            );
            if (!authorized.length) {
                const [existing] = await db.execute('SELECT participation_id FROM learning_participations WHERE participation_id = ?', [participationId]);
                if (!existing.length) return res.status(404).json({ success: false, message: 'Participant record not found.' });
                return rejectNonCertifier(res);
            }
        }
        const [certificateRows] = await db.execute(
            'SELECT certificate_number, certificate_verification_code FROM learning_participations WHERE participation_id = ?',
            [participationId]
        );
        res.json({ success: true, message: 'Participant status updated.', ...certificateRows[0] });
    } catch (error) {
        next(error);
    }
});

router.patch('/:id/certificate', requireProgressEdit, async (req, res, next) => {
    const participationId = Number(req.params.id);
    const certificationDate = typeof req.body?.certification_date === 'string' ? req.body.certification_date.trim() : '';
    if (!Number.isSafeInteger(participationId) || participationId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid learning record ID.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(certificationDate) || Number.isNaN(Date.parse(`${certificationDate}T00:00:00Z`))) {
        return res.status(400).json({ success: false, message: 'Enter a valid certification date.' });
    }
    try {
        const verificationCode = randomBytes(24).toString('hex');
        const certificateNumber = await nextCertificateNumber();
        const [result] = await db.execute(
            `UPDATE learning_participations
             SET certified = TRUE, certificate_number = COALESCE(certificate_number, ?), certification_date = ?,
                 certificate_verification_code = COALESCE(certificate_verification_code, ?)
             WHERE participation_id = ? AND completed = TRUE
               AND EXISTS (
                   SELECT 1 FROM learning_event_certifiers certifier
                   WHERE certifier.event_id = learning_participations.event_id
                     AND certifier.certifier_user_id = ?
               )`,
            [certificateNumber, certificationDate, verificationCode, participationId, req.auth.user_id]
        );
        if (!result.affectedRows) {
            const [existing] = await db.execute(
                'SELECT completed FROM learning_participations WHERE participation_id = ?',
                [participationId]
            );
            if (!existing.length) return res.status(404).json({ success: false, message: 'Learning record not found.' });
            if (!existing[0].completed) return res.status(400).json({ success: false, message: 'Mark this learner completed before issuing a certificate.' });
            return rejectNonCertifier(res);
        }
        const [certificateRows] = await db.execute(
            'SELECT certificate_number, certificate_verification_code FROM learning_participations WHERE participation_id = ?',
            [participationId]
        );
        res.json({ success: true, message: 'Certificate issued.', ...certificateRows[0] });
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', requireProgressDelete, async (req, res, next) => {
    const participationId = Number(req.params.id);
    if (!Number.isSafeInteger(participationId) || participationId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid learning record ID.' });
    }

    try {
        const [result] = await db.execute(
            'DELETE FROM learning_participations WHERE participation_id = ?',
            [participationId]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Learning record not found.' });
        }
        res.json({ success: true, message: 'Learning record deleted.' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
