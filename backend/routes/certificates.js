const express = require('express');
const db = require('../config/db');

const router = express.Router();

router.get('/:code', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');
    const { code } = req.params;
    const notFound = () => res.status(404).json({ message: 'No valid certificate was found for this link.' });
    if (!/^[0-9a-f]{48}$/.test(code)) return notFound();

    try {
        const [rows] = await db.execute(
            `SELECT participation.certificate_number,
                    DATE_FORMAT(participation.certification_date, '%Y-%m-%d') AS certification_date,
                    CONCAT_WS(' ', person.first_name, NULLIF(person.middle_name, ''), person.last_name, NULLIF(person.suffix, '')) AS recipient_name,
                    person.profilepict AS recipient_photo,
                    course.title AS course_title, course.learning_level,
                    institution.name AS offering_institution,
                    DATE_FORMAT(event.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(event.end_date, '%Y-%m-%d') AS end_date
             FROM learning_participations participation
             JOIN users person ON person.user_id = participation.user_id
             JOIN learning_events event ON event.event_id = participation.event_id
             LEFT JOIN learning_courses course ON course.course_id = event.course_id
             LEFT JOIN organizational_units institution ON institution.unit_id = event.institution_id
             WHERE participation.certificate_verification_code = ?
               AND participation.certified = TRUE AND participation.completed = TRUE
               AND participation.certificate_number IS NOT NULL AND participation.certification_date IS NOT NULL`,
            [code],
        );
        if (!rows.length) return notFound();
        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
