const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const db = require('../config/db');
const { PERMISSIONS, requirePermission, requireAnyPermission } = require('../middleware/permissions');

const router = express.Router();
const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;
const profilePicturesDirectory = path.resolve(
    __dirname,
    '..',
    process.env.PROFILE_PICTURES_DIR || '../resources'
);
const credentialDirectory = path.resolve(
    __dirname,
    '..',
    process.env.NEW_USER_CREDENTIALS_DIR || '../temp/user-credentials'
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

function filenameNamePart(name) {
    const letters = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase();
    return letters || 'USR';
}

async function saveTemporaryPasswordFile(user, password) {
    await fs.mkdir(credentialDirectory, { recursive: true, mode: 0o700 });
    const filename = `${filenameNamePart(user.last_name)}${filenameNamePart(user.first_name)}${password.slice(0, 5)}-${user.user_id}.txt`;
    const filePath = path.join(credentialDirectory, filename);
    const credentialText = [
        'TRAINING CERTIFICATION MANAGEMENT SYSTEM',
        'TEMPORARY USER CREDENTIAL',
        `User ID: ${user.user_id}`,
        `Name: ${[user.first_name, user.middle_name, user.last_name, user.suffix].filter(Boolean).join(' ')}`,
        `Email: ${user.email || 'Not provided'}`,
        `Cellphone Number: ${user.phone_number || 'Not provided'}`,
        `Temporary Password: ${password}`,
        'Change this password immediately after first login.',
        `Generated: ${new Date().toISOString()}`,
        '',
        'Share this password securely and delete this file after it has been delivered.'
    ].join(os.EOL);

    await fs.writeFile(filePath, credentialText, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return filePath;
}

async function removePreviousCredentialFiles(userId, keepPath) {
    try {
        const filenames = await fs.readdir(credentialDirectory);
        await Promise.all(filenames
            .filter((filename) => filename.endsWith(`-${userId}.txt`))
            .map((filename) => path.join(credentialDirectory, filename))
            .filter((filePath) => filePath !== keepPath)
            .map((filePath) => fs.unlink(filePath).catch(() => {})));
    } catch {
        // Cleanup is best-effort; it must not undo a successful password reset.
    }
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

router.use(authenticateToken);

router.get('/options', requireAnyPermission('users.add', 'users.edit'), async (req, res, next) => {
    try {
        const [units] = await db.execute(
            'SELECT unit_id, name, unit_type FROM organizational_units ORDER BY name'
        );

        res.json({ success: true, data: { units, permissions: PERMISSIONS } });
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
           u.unit_id, o.name AS unit_name, o.unit_type, u.is_active, u.created_at
    FROM users u
    JOIN organizational_units o ON o.unit_id = u.unit_id
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

router.put('/:id', requireUserEdit, async (req, res, next) => {
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
    let credentialFilePath;
    let credentialFileCreated = false;
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
        const temporaryPassword = crypto.randomBytes(9).toString('base64url');
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        await connection.execute(
            'UPDATE users SET password_hash = ?, must_change_password = TRUE WHERE user_id = ?',
            [passwordHash, userId]
        );
        credentialFilePath = await saveTemporaryPasswordFile(targetUser, temporaryPassword);
        credentialFileCreated = true;
        await connection.commit();

        await removePreviousCredentialFiles(userId, credentialFilePath);
        res.json({
            success: true,
            message: 'Temporary password generated. The user must change it at next sign-in.',
            credential_file: credentialFilePath
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (credentialFileCreated) await fs.unlink(credentialFilePath).catch(() => {});
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

router.post('/', requireUserAdd, async (req, res, next) => {
    let connection;
    let credentialFilePath;
    let credentialFileCreated = false;
    let profilePicturePath;
    let profilePictureCreated = false;
    const body = req.body || {};
    const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : '';
    const middleName = typeof body.middle_name === 'string' ? body.middle_name.trim() : '';
    const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : '';
    const suffix = typeof body.suffix === 'string' ? body.suffix.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phoneNumber = typeof body.phone_number === 'string' ? body.phone_number.trim() : '';
    const unitId = Number(body.unit_id);

    if (!firstName || !lastName || !phoneNumber || !unitId) {
        return res.status(400).json({ success: false, message: 'Fill in all required fields.' });
    }
    if (firstName.length > 100 || middleName.length > 100 || lastName.length > 100) {
        return res.status(400).json({ success: false, message: 'Names must be 100 characters or fewer.' });
    }
    if (suffix.length > 20) {
        return res.status(400).json({ success: false, message: 'Name suffix must be 20 characters or fewer.' });
    }
    if (phoneNumber.length > 20) {
        return res.status(400).json({ success: false, message: 'Phone number must be 20 characters or fewer.' });
    }
    if (email.length > 150 || (email && !/^\S+@\S+\.\S+$/.test(email))) {
        return res.status(400).json({ success: false, message: 'Enter a valid email address (150 characters maximum).' });
    }
    if (!Number.isSafeInteger(unitId)) {
        return res.status(400).json({ success: false, message: 'Choose a valid institution.' });
    }

    let profilePicture;
    try {
        profilePicture = decodeProfilePicture(body.profile_picture);
    } catch (error) {
        return res.status(error.status || 400).json({ success: false, message: error.message });
    }

    try {
        connection = await db.getConnection();
        const [unitRows] = await connection.execute('SELECT name FROM organizational_units WHERE unit_id = ?', [unitId]);
        if (!unitRows.length) {
            return res.status(400).json({ success: false, message: 'Choose a valid institution.' });
        }

        const password = crypto.randomBytes(9).toString('base64url');
        const passwordHash = await bcrypt.hash(password, 12);
        await connection.beginTransaction();
        const [result] = await connection.execute(
            `INSERT INTO users
                (first_name, middle_name, last_name, suffix, email, phone_number, password_hash, unit_id, profilepict, is_active, must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)`,
            [
                firstName,
                middleName || null,
                lastName,
                suffix || null,
                email || null,
                phoneNumber,
                passwordHash,
                unitId,
                profilePicture?.filename || null
            ]
        );

        if (profilePicture) {
            profilePicturePath = await writeProfilePictureFile(profilePicture);
            profilePictureCreated = true;
        }

        credentialFilePath = await saveTemporaryPasswordFile({
            user_id: result.insertId,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            suffix,
            email,
            phone_number: phoneNumber
        }, password);
        credentialFileCreated = true;
        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'User created successfully.',
            credential_file: credentialFilePath,
            data: {
                user_id: result.insertId,
                first_name: firstName,
                middle_name: middleName,
                last_name: lastName,
                suffix,
                email: email || null,
                phone_number: phoneNumber,
                profilepict: profilePicture?.filename || '',
                unit: unitRows[0].name
            }
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (credentialFileCreated) await fs.unlink(credentialFilePath).catch(() => {});
        if (profilePictureCreated) await fs.unlink(profilePicturePath).catch(() => {});
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'That email address or phone number is already registered.' });
        }
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
