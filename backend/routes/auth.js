const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

// Login Endpoint
router.post('/login', async (req, res) => {
    // 1. Read 'identifier' if sent directly, or fall back to 'username' or 'email' sent by the frontend
    const identifier = req.body.identifier || req.body.username || req.body.email;
    const { password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ success: false, message: "Please fill out all fields." });
    }

    try {
        // Find user by email OR phone number and join their organizational unit info
        // Added u.middle_name and u.profilepict explicitly to the column query select matrix
        const query = `
            SELECT u.*, o.name AS unit_name, o.unit_type 
            FROM users u
            JOIN organizational_units o ON u.unit_id = o.unit_id
            WHERE (u.email = ? OR u.phone_number = ?) AND u.is_active = TRUE
        `;
        
        const [users] = await db.execute(query, [identifier, identifier]);

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid email/phone or password." });
        }

        // Extracted first object out of array to prevent undefined parameter errors
        const user = users[0];

        // Compare input password with database hash
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid email/phone or password." });
        }

        const sessionId = crypto.randomUUID();
        await db.execute(
            'UPDATE users SET active_session_id = ? WHERE user_id = ? AND is_active = TRUE',
            [sessionId, user.user_id]
        );

        // Each successful login replaces the user's previous active session.
        const payload = {
            userId: user.user_id,
            sessionId,
            firstName: user.first_name,
            lastName: user.last_name,
            unitId: user.unit_id,
            unitType: user.unit_type,
            unitName: user.unit_name,
            mustChangePassword: Boolean(user.must_change_password),
            canAddUsers: Boolean(user.can_add_users), canEditUsers: Boolean(user.can_edit_users), canDeleteUsers: Boolean(user.can_delete_users),
            canAddCourses: Boolean(user.can_add_courses), canEditCourses: Boolean(user.can_edit_courses), canDeleteCourses: Boolean(user.can_delete_courses),
            canAddEvents: Boolean(user.can_add_events), canEditEvents: Boolean(user.can_edit_events), canDeleteEvents: Boolean(user.can_delete_events),
            canAddProgress: Boolean(user.can_add_progress), canEditProgress: Boolean(user.can_edit_progress), canDeleteProgress: Boolean(user.can_delete_progress)
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

        // 2. Refined JSON response object to match your homepage's required format
        res.json({
            success: true,
            token,
            data: {
                id: user.user_id,
                first_name: user.first_name,
                middle_name: user.middle_name || '', // Passes your separate column values
                last_name: user.last_name,
                suffix: user.suffix || '',
                must_change_password: Boolean(user.must_change_password),
                profilepict: user.profilepict || '', // Passes your profile picture filename
                unitName: user.unit_name
              }
        });

    } catch (error) {
        console.error("Auth Engine Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

router.get('/session', async (req, res) => {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';
    if (!token) return res.status(401).json({ success: false, message: 'Sign in to continue.' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (!payload.sessionId) {
            return res.status(401).json({ success: false, message: 'This session is no longer active. Please sign in again.' });
        }
        const [users] = await db.execute(
            'SELECT active_session_id FROM users WHERE user_id = ? AND is_active = TRUE',
            [payload.userId]
        );
        if (!users.length || users[0].active_session_id !== payload.sessionId) {
            return res.status(401).json({ success: false, message: 'You signed in from another browser or device. Please sign in again.' });
        }
        res.json({ success: true, active: true });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Your session is invalid or expired. Please sign in again.' });
        }
        console.error('Session check error:', error);
        res.status(500).json({ success: false, message: 'Could not verify your session.' });
    }
});

router.post('/logout', async (req, res) => {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';
    if (!token) return res.json({ success: true });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.sessionId) {
            await db.execute(
                'UPDATE users SET active_session_id = NULL WHERE user_id = ? AND active_session_id = ?',
                [payload.userId, payload.sessionId]
            );
        }
        res.json({ success: true });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.json({ success: true });
        }
        console.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Could not complete sign-out.' });
    }
});

router.post('/change-password', async (req, res) => {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';

    if (!token) {
        return res.status(401).json({ success: false, message: 'Sign in to change your password.' });
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ success: false, message: 'Your session is invalid or expired. Please sign in again.' });
    }

    const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';
    if (newPassword.length < 6 || Buffer.byteLength(newPassword, 'utf8') > 72) {
        return res.status(400).json({ success: false, message: 'Choose a password at least 6 characters long and no more than 72 bytes.' });
    }

    try {
        const [users] = await db.execute(
            `SELECT u.user_id, u.first_name, u.last_name, u.password_hash, u.must_change_password,
                    u.active_session_id,
                    u.unit_id,
                    u.can_add_users, u.can_edit_users, u.can_delete_users,
                    u.can_add_courses, u.can_edit_courses, u.can_delete_courses,
                    u.can_add_events, u.can_edit_events, u.can_delete_events,
                    u.can_add_progress, u.can_edit_progress, u.can_delete_progress,
                    o.name AS unit_name, o.unit_type
             FROM users u
             JOIN organizational_units o ON o.unit_id = u.unit_id
             WHERE u.user_id = ? AND u.is_active = TRUE`,
            [payload.userId]
        );

        if (!users.length) {
            return res.status(401).json({ success: false, message: 'Your account is inactive or no longer exists.' });
        }
        const user = users[0];
        if (!payload.sessionId || user.active_session_id !== payload.sessionId) {
            return res.status(401).json({ success: false, message: 'You signed in from another browser or device. Please sign in again.' });
        }
        if (!user.must_change_password) {
            return res.status(409).json({ success: false, message: 'No first-login password change is pending.' });
        }
        if (await bcrypt.compare(newPassword, user.password_hash)) {
            return res.status(400).json({ success: false, message: 'Choose a password different from the temporary password.' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);
        const [updateResult] = await db.execute(
            'UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE user_id = ? AND is_active = TRUE AND must_change_password = TRUE',
            [passwordHash, user.user_id]
        );
        if (!updateResult.affectedRows) {
            return res.status(409).json({ success: false, message: 'The password has already been changed. Please sign in again.' });
        }

        const newToken = jwt.sign({
            userId: user.user_id,
            sessionId: payload.sessionId,
            firstName: user.first_name,
            lastName: user.last_name,
            unitId: user.unit_id,
            unitType: user.unit_type,
            unitName: user.unit_name,
            mustChangePassword: false,
            canAddUsers: Boolean(user.can_add_users), canEditUsers: Boolean(user.can_edit_users), canDeleteUsers: Boolean(user.can_delete_users),
            canAddCourses: Boolean(user.can_add_courses), canEditCourses: Boolean(user.can_edit_courses), canDeleteCourses: Boolean(user.can_delete_courses),
            canAddEvents: Boolean(user.can_add_events), canEditEvents: Boolean(user.can_edit_events), canDeleteEvents: Boolean(user.can_delete_events),
            canAddProgress: Boolean(user.can_add_progress), canEditProgress: Boolean(user.can_edit_progress), canDeleteProgress: Boolean(user.can_delete_progress)
        }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.json({ success: true, message: 'Password changed successfully.', token: newToken });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ success: false, message: 'Could not change the password right now.' });
    }
});

module.exports = router;
