const express = require('express');
const { isValidEmail } = require('../utils/credentialEmail');

function createSignupRouter({ database = require('../config/db'), now = Date.now } = {}) {
    const router = express.Router();
    // Instance-local limits; do not trust caller-supplied forwarding headers.
    const attempts = new Map();
    router.post('/', express.json({ limit: '8kb' }), async (req, res) => {
        const time = now();
        for (const [key, value] of attempts) if (value.expires <= time) attempts.delete(key);
        const key = req.ip || req.socket.remoteAddress || 'unknown';
        const bucket = attempts.get(key) || { count: 0, expires: time + 15 * 60 * 1000 };
        if (bucket.count >= 3 || (!attempts.has(key) && attempts.size >= 10000)) {
            res.set('Retry-After', '900');
            return res.status(429).json({ success: false, message: 'Too many requests. Please try again in 15 minutes.' });
        }
        bucket.count += 1;
        attempts.set(key, bucket);

        const fields = {};
        for (const [field, limit] of Object.entries({ first_name: 100, last_name: 100, email: 150, phone_number: 20, message: 1000 })) {
            const value = req.body?.[field];
            if (value !== undefined && typeof value !== 'string') {
                return res.status(400).json({ success: false, message: 'Please check the request fields.' });
            }
            fields[field] = (value || '').trim();
            if (fields[field].length > limit) {
                return res.status(400).json({ success: false, message: 'One of the request fields is too long.' });
            }
        }
        if (!fields.first_name || !fields.last_name || !isValidEmail(fields.email)) {
            return res.status(400).json({ success: false, message: 'Enter your name and a valid email address.' });
        }

        try {
            await database.execute(
                'INSERT INTO signup_requests (first_name, last_name, email, phone_number, message) VALUES (?, ?, ?, ?, ?)',
                [fields.first_name, fields.last_name, fields.email.toLowerCase(), fields.phone_number || null, fields.message || null]
            );
            return res.status(201).json({ success: true, message: 'Your signup request has been saved for administrator review. If approved, your sign-in details will be emailed to you.' });
        } catch {
            return res.status(503).json({ success: false, message: 'We could not save your signup request. Please try again later.' });
        }
    });
    router.use((error, req, res, next) => {
        if (error.type === 'entity.too.large' || error.type === 'entity.parse.failed') {
            return res.status(400).json({ success: false, message: 'Please submit a valid signup request of the allowed size.' });
        }
        next(error);
    });
    return router;
}

module.exports = { createSignupRouter };
