const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs/promises');
const { isValidEmail, sendCredentialEmail } = require('../utils/credentialEmail');
const path = require('path');
const db = require('../config/db');
const { unitTypeLabelSql } = require('../utils/unitTypeCodes');
const { PERMISSIONS, requirePermission } = require('../middleware/permissions');

const router = express.Router();
const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;
const profilePicturesDirectory = path.resolve(
    __dirname,
    '..',
    process.env.PROFILE_PICTURES_DIR || '../resources'
);

function decodeProfilePicture(picture) {
    if (!picture) return null;

    if (typeof picture.data !== 'string' || picture.data.length > Math.ceil(MAX_PROFILE_PICTURE_BYTES / 3) * 4) {
        const error = new Error('Profile picture must be 5 MB or smaller.');
        error.status = 400;
        throw error;
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(picture.data)) {
        const error = new Error('Profile picture data is invalid.');
        error.status = 400;
        throw error;
    }

    const buffer = Buffer.from(picture.data, 'base64');
    if (!buffer.length || buffer.length > MAX_PROFILE_PICTURE_BYTES) {
        const error = new Error('Profile picture must be 5 MB or smaller.');
        error.status = 400;
        throw error;
    }

    let extension;
    let mimeType;
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        extension = 'png';
        mimeType = 'image/png';
    } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        extension = 'jpg';
        mimeType = 'image/jpeg';
    } else if (buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)) {
        extension = 'gif';
        mimeType = 'image/gif';
    } else if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        extension = 'webp';
        mimeType = 'image/webp';
    } else {
        const error = new Error('Choose a valid JPEG, PNG, GIF, or WebP image.');
        error.status = 400;
        throw error;
    }

    if (picture.mime_type && picture.mime_type !== mimeType) {
        const error = new Error('The selected file type does not match the image.');
        error.status = 400;
        throw error;
    }

    return {
        buffer,
        filename: `profile-${crypto.randomUUID()}.${extension}`
    };
}

async function writeProfilePictureFile(picture) {
    await fs.mkdir(profilePicturesDirectory, { recursive: true, mode: 0o700 });
    const filePath = path.join(profilePicturesDirectory, picture.filename);
    await fs.writeFile(filePath, picture.buffer, { flag: 'wx', mode: 0o600 });
    return filePath;
}

async function removeStoredProfilePicture(filename) {
    if (!/^profile-[0-9a-f-]{36}\.(?:jpg|png|gif|webp)$/i.test(filename || '')) return;
    await fs.unlink(path.join(profilePicturesDirectory, filename)).catch(() => {});
}

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
            `SELECT u.user_id, u.unit_id, u.must_change_password, u.active_session_id,
                    u.can_add_users, u.can_edit_users, u.can_delete_users,
                    u.can_add_courses, u.can_edit_courses, u.can_delete_courses,
                    u.can_add_events, u.can_edit_events, u.can_delete_events,
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

const requireUserAdd = requirePermission('users.add');
const requireUserEdit = requirePermission('users.edit');
const requireUserDelete = requirePermission('users.delete');

function requireOwnProfileOrUserEdit(req, res, next) {
    if (Number(req.params.id) === Number(req.auth.user_id)) return next();
    return requireUserEdit(req, res, next);
}

const photoUploads = new Map();
const PHOTO_UPLOAD_TTL = 5 * 60 * 1000;
const MOBILE_PHOTO_LIMIT = 256 * 1024;

function closePhotoUpload(id, upload) {
    clearTimeout(upload.timer);
    photoUploads.delete(id);
}

router.put('/profile-photo-upload', express.raw({ type: 'image/jpeg', limit: MOBILE_PHOTO_LIMIT }), (req, res) => {
    res.set('Cache-Control', 'no-store');
    const [id, secret] = (req.get('X-Photo-Upload') || '').split('.');
    const upload = photoUploads.get(id);
    if (!upload || upload.secret !== secret || Date.now() >= upload.expiresAt) {
        return res.status(410).json({ message: 'This photo link has expired. Generate a new QR code.' });
    }
    if (upload.photo) return res.json({ success: true });
    if (!Buffer.isBuffer(req.body) || req.body.length > MOBILE_PHOTO_LIMIT) {
        return res.status(400).json({ message: 'Choose a JPEG photo up to 256 KB.' });
    }
    try {
        upload.photo = decodeProfilePicture({ data: req.body.toString('base64'), mime_type: 'image/jpeg' }).buffer;
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.use(authenticateToken);

router.post('/:id/profile-photo-uploads', requireOwnProfileOrUserEdit, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const owner = req.auth.active_session_id;
    if (photoUploads.size >= 128) {
        return res.status(503).json({ message: 'Photo uploads are busy. Try again shortly.' });
    }
    const id = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + PHOTO_UPLOAD_TTL;
    const upload = { owner, userId: req.params.id, secret, expiresAt, photo: null };
    upload.timer = setTimeout(() => closePhotoUpload(id, upload), PHOTO_UPLOAD_TTL);
    upload.timer.unref();
    photoUploads.set(id, upload);
    res.status(201).json({ id, token: `${id}.${secret}` });
});

router.route('/:id/profile-photo-uploads/:uploadId').all(requireOwnProfileOrUserEdit, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const upload = photoUploads.get(req.params.uploadId);
    if (!upload || upload.owner !== req.auth.active_session_id || upload.userId !== req.params.id || Date.now() >= upload.expiresAt) {
        return res.status(410).json({ message: 'This photo link has expired. Generate a new QR code.' });
    }
    req.photoUpload = upload;
    next();
}).get((req, res) => {
    if (!req.photoUpload.photo) return res.sendStatus(204);
    res.type('jpeg').send(req.photoUpload.photo);
}).delete((req, res) => {
    closePhotoUpload(req.params.uploadId, req.photoUpload);
    res.sendStatus(204);
});

router.get('/signup-requests/count', requireUserAdd, async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT COUNT(*) AS pending_count FROM signup_requests WHERE status IN ('pending', 'reviewed')");
        res.json({ success: true, pending_count: Number(rows[0].pending_count) });
    } catch {
        res.status(503).json({ success: false, message: 'Could not load the signup request count.' });
    }
});

router.get('/signup-requests', requireUserAdd, async (req, res) => {
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) {
        return res.status(400).json({ success: false, message: 'Invalid page.' });
    }
    try {
        const [counts] = await db.execute('SELECT COUNT(*) AS total FROM signup_requests');
        const [requests] = await db.execute(
            `SELECT request_id, first_name, last_name, email, phone_number, message, status, created_at, created_user_id
             FROM signup_requests ORDER BY created_at DESC, request_id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`
        );
        res.json({ success: true, data: requests, total: Number(counts[0].total), page, page_size: 50 });
    } catch {
        res.status(503).json({ success: false, message: 'Could not load signup requests. Check that the signup requests database migration has been applied.' });
    }
});

router.patch('/signup-requests/:id', requireUserAdd, async (req, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status;
    if (!Number.isSafeInteger(id) || id < 1 || !['pending', 'reviewed', 'dismissed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid request or status.' });
    }
    try {
        const [rows] = await db.execute('SELECT request_id, status FROM signup_requests WHERE request_id = ?', [id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Signup request not found.' });
        if (rows[0].status === 'created') return res.status(409).json({ success: false, message: 'This request already has an account.' });
        const [result] = await db.execute('UPDATE signup_requests SET status = ?, reviewed_at = IF(? = \'pending\', NULL, CURRENT_TIMESTAMP) WHERE request_id = ? AND status <> \'created\'', [status, status, id]);
        if (!result.affectedRows) return res.status(409).json({ success: false, message: 'The request changed. Reload the list before trying again.' });
        res.json({ success: true, message: 'Request status updated.' });
    } catch {
        res.status(503).json({ success: false, message: 'Could not update this signup request.' });
    }
});

router.post('/signup-requests/:id/create-user', requireUserAdd, async (req, res, next) => {
    const requestId = Number(req.params.id);
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid signup request.' });
    }
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [requests] = await connection.execute('SELECT * FROM signup_requests WHERE request_id = ? FOR UPDATE', [requestId]);
        if (!requests.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Signup request not found.' });
        }
        const request = requests[0];
        if (request.status === 'created' || request.created_user_id || request.status === 'dismissed') {
            await connection.rollback();
            return res.status(409).json({ success: false, message: request.status === 'dismissed' ? 'Reopen this dismissed request before creating an account.' : 'An account has already been created from this request.' });
        }
        if (!isValidEmail(request.email)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'A valid request email address is required.' });
        }
        const [existing] = await connection.execute('SELECT user_id FROM users WHERE email = ? OR (phone_number = ? AND ? IS NOT NULL)', [request.email, request.phone_number || null, request.phone_number || null]);
        if (existing.length) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'A user with this email address or phone number already exists. Review their account in Users.' });
        }
        const password = crypto.randomBytes(9).toString('base64url');
        const hash = await bcrypt.hash(password, 12);
        const [result] = await connection.execute(
            `INSERT INTO users (first_name, last_name, email, phone_number, password_hash, unit_id, is_active, must_change_password,
                ${PERMISSIONS.map((permission) => permission.column).join(', ')})
             VALUES (?, ?, ?, ?, ?, NULL, TRUE, TRUE, ${PERMISSIONS.map(() => 'FALSE').join(', ')})`,
            [request.first_name, request.last_name, request.email, request.phone_number || null, hash]
        );
        await connection.execute("UPDATE signup_requests SET status = 'created', created_user_id = ?, reviewed_at = CURRENT_TIMESTAMP WHERE request_id = ?", [result.insertId, requestId]);
        await sendCredentialEmail(request, password);
        await connection.commit();
        res.status(201).json({ success: true, user_id: result.insertId, credential_email: request.email, message: `Account created. Temporary sign-in credentials were emailed to ${request.email}.` });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (error.code === 'CREDENTIAL_EMAIL_ERROR') return res.status(error.status).json({ success: false, message: error.message });
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'That email address or phone number is already registered.' });
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

router.get('/options', async (req, res, next) => {
    try {
        const [units] = await db.execute(
            `SELECT unit_id, name, ${unitTypeLabelSql('unit_type')} AS unit_type FROM organizational_units ORDER BY name`
        );

        res.json({ success: true, data: { units, permissions: req.auth.can_edit_users ? PERMISSIONS : [] } });
    } catch (error) {
        next(error);
    }
});

router.get('/:id/permissions', requireUserEdit, async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        const columns = PERMISSIONS.map((item) => `u.${item.column}`).join(', ');
        const [rows] = await db.execute(`SELECT ${columns} FROM users u WHERE u.user_id = ?`, [userId]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, data: PERMISSIONS.filter((item) => rows[0][item.column]).map((item) => item.key) });
    } catch (error) { next(error); }
});

router.put('/:id/permissions', requireUserEdit, async (req, res, next) => {
    const userId = Number(req.params.id);
    const granted = req.body?.permissions;
    if (!Number.isSafeInteger(userId) || userId < 1 || !Array.isArray(granted) || granted.some((key) => !PERMISSIONS.some((item) => item.key === key))) {
        return res.status(400).json({ success: false, message: 'Choose valid permissions.' });
    }
    if (userId === req.auth.user_id) return res.status(409).json({ success: false, message: 'Your own permissions cannot be changed here.' });
    try {
        const values = PERMISSIONS.map((item) => granted.includes(item.key));
        const [result] = await db.execute(
            `UPDATE users SET ${PERMISSIONS.map((item) => `${item.column} = ?`).join(', ')} WHERE user_id = ? AND is_active = TRUE`,
            [...values, userId]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Active user not found.' });
        res.json({ success: true, data: granted });
    } catch (error) {
        next(error);
    }
});

const USER_LIST_QUERY = `
    SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.suffix,
           u.email, u.phone_number, u.profilepict,
           u.unit_id, o.name AS unit_name, ${unitTypeLabelSql('o.unit_type')} AS unit_type, u.is_active, u.created_at
    FROM users u
    LEFT JOIN organizational_units o ON o.unit_id = u.unit_id
`;

router.get('/', async (req, res, next) => {
    try {
        const [users] = await db.execute(`${USER_LIST_QUERY} ORDER BY u.user_id DESC`);
        res.json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
});

router.get('/:id', async (req, res, next) => {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    try {
        const [users] = await db.execute(`${USER_LIST_QUERY} WHERE u.user_id = ?`, [userId]);
        if (!users.length) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.json({ success: true, data: users[0] });
    } catch (error) {
        next(error);
    }
});

router.put('/:id', requireOwnProfileOrUserEdit, async (req, res, next) => {
    const userId = Number(req.params.id);
    const body = req.body || {};
    const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : '';
    const middleName = typeof body.middle_name === 'string' ? body.middle_name.trim() : '';
    const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : '';
    const suffix = typeof body.suffix === 'string' ? body.suffix.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phoneNumber = typeof body.phone_number === 'string' ? body.phone_number.trim() : '';
    const unitId = Number(body.unit_id);
    let profilePicture;
    let profilePicturePath;
    let profilePictureCreated = false;
    let profilePictureReferenced = false;

    try {
        profilePicture = body.profile_picture ? decodeProfilePicture(body.profile_picture) : null;
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, message: error.message });
    }

    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }
    if (!firstName || !lastName || !phoneNumber || !unitId) {
        return res.status(400).json({ success: false, message: 'Fill in all required fields.' });
    }
    if (firstName.length > 100 || middleName.length > 100 || lastName.length > 100) {
        return res.status(400).json({ success: false, message: 'Names must be 100 characters or fewer.' });
    }
    if (suffix.length > 20 || phoneNumber.length > 20 || email.length > 150) {
        return res.status(400).json({ success: false, message: 'Suffix, phone, or email is too long.' });
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!Number.isSafeInteger(unitId)) {
        return res.status(400).json({ success: false, message: 'Choose a valid institution.' });
    }

    try {
        const [existingUsers] = await db.execute(
            'SELECT user_id, profilepict FROM users WHERE user_id = ?',
            [userId]
        );
        if (!existingUsers.length) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const [units] = await db.execute('SELECT unit_id FROM organizational_units WHERE unit_id = ?', [unitId]);
        if (!units.length) {
            return res.status(400).json({ success: false, message: 'Choose a valid institution.' });
        }

        if (profilePicture) {
            profilePicturePath = await writeProfilePictureFile(profilePicture);
            profilePictureCreated = true;
        }

        const updateFields = `first_name = ?, middle_name = ?, last_name = ?, suffix = ?, email = ?,
                              phone_number = ?, unit_id = ?`;
        const updateParams = [firstName, middleName || null, lastName, suffix || null, email || null, phoneNumber, unitId];
        if (profilePicture) {
            await db.execute(
                `UPDATE users SET ${updateFields}, profilepict = ? WHERE user_id = ?`,
                [...updateParams, profilePicture.filename, userId]
            );
            profilePictureReferenced = true;
        } else {
            await db.execute(`UPDATE users SET ${updateFields} WHERE user_id = ?`, [...updateParams, userId]);
        }

        const [updatedUsers] = await db.execute(`${USER_LIST_QUERY} WHERE u.user_id = ?`, [userId]);
        if (profilePicture) await removeStoredProfilePicture(existingUsers[0].profilepict);
        res.json({ success: true, message: 'User updated successfully.', data: updatedUsers[0] });
    } catch (error) {
        if (profilePictureCreated && !profilePictureReferenced) await fs.unlink(profilePicturePath).catch(() => {});
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'That email address or phone number is already registered.' });
        }
        next(error);
    }
});

router.post('/:id/reactivate', requireUserEdit, async (req, res, next) => {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    try {
        const [existingUsers] = await db.execute(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );
        if (!existingUsers.length) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        await db.execute('UPDATE users SET is_active = TRUE WHERE user_id = ?', [userId]);
        const [reactivatedUsers] = await db.execute(`${USER_LIST_QUERY} WHERE u.user_id = ?`, [userId]);
        res.json({ success: true, message: 'User reactivated successfully.', data: reactivatedUsers[0] });
    } catch (error) {
        next(error);
    }
});

router.delete('/:id', requireUserDelete, async (req, res, next) => {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }
    if (userId === req.auth.user_id) {
        return res.status(409).json({ success: false, message: 'You cannot deactivate your own account.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [users] = await connection.execute(
            'SELECT user_id, is_active FROM users WHERE user_id = ? FOR UPDATE',
            [userId]
        );
        if (!users.length || !users[0].is_active) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Active user not found.' });
        }

        await connection.execute('UPDATE users SET is_active = FALSE WHERE user_id = ?', [userId]);
        await connection.commit();
        res.json({ success: true, message: 'User deactivated successfully.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

router.post('/:id/reset-password', requireUserEdit, async (req, res, next) => {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }
    if (userId === req.auth.user_id) {
        return res.status(409).json({ success: false, message: 'Use your own account password settings instead of resetting your own password.' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [users] = await connection.execute(
            `SELECT user_id, first_name, middle_name, last_name, suffix, email, phone_number, is_active
             FROM users WHERE user_id = ? FOR UPDATE`,
            [userId]
        );
        if (!users.length || !users[0].is_active) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Active user not found.' });
        }

        const targetUser = users[0];
        if (!isValidEmail(targetUser.email)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Add a valid email address to this user before resetting their password.' });
        }
        const temporaryPassword = crypto.randomBytes(9).toString('base64url');
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        await connection.execute(
            'UPDATE users SET password_hash = ?, must_change_password = TRUE, active_session_id = NULL WHERE user_id = ?',
            [passwordHash, userId]
        );
        await sendCredentialEmail(targetUser, temporaryPassword, { reset: true });
        await connection.commit();

        res.json({
            success: true,
            message: 'Temporary password emailed. The user must change it at next sign-in.',
            credential_email: targetUser.email
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (error.code === 'CREDENTIAL_EMAIL_ERROR') {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
