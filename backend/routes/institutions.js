const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { UNIT_TYPE_CODES, unitTypeLabelSql } = require('../utils/unitTypeCodes');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');

const router = express.Router();
const UNIT_TYPES = Object.keys(UNIT_TYPE_CODES);

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
            `SELECT u.user_id, u.must_change_password, u.active_session_id, u.can_add_events, u.can_edit_events
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

const requireInstitutionEdit = requirePermission('events.edit');

router.use(authenticateToken);

router.get('/options', requireAnyPermission('events.add', 'events.edit'), async (req, res, next) => {
    try {
        const [units] = await db.execute(
            `SELECT unit_id, name, ${unitTypeLabelSql('unit_type')} AS unit_type, parent_unit_id
             FROM organizational_units ORDER BY name`
        );
        res.json({ success: true, data: units });
    } catch (error) {
        next(error);
    }
});

router.get('/', async (req, res, next) => {
    try {
        const [institutions] = await db.execute(
            `SELECT unit.unit_id, unit.name, ${unitTypeLabelSql('unit.unit_type')} AS unit_type, unit.parent_unit_id,
                    parent.name AS parent_name, unit.created_at,
                    (SELECT COUNT(*) FROM organizational_units child
                     WHERE child.parent_unit_id = unit.unit_id) AS child_count
             FROM organizational_units unit
             LEFT JOIN organizational_units parent ON parent.unit_id = unit.parent_unit_id
             ORDER BY unit.name, unit.unit_id`
        );
        res.json({ success: true, data: institutions });
    } catch (error) {
        next(error);
    }
});

router.put('/:id', requireInstitutionEdit, async (req, res, next) => {
    const unitId = Number(req.params.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const unitType = typeof req.body?.unit_type === 'string' ? req.body.unit_type : '';
    const rawParentId = req.body?.parent_unit_id;
    let parentUnitId = null;

    if (!Number.isSafeInteger(unitId) || unitId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid institution ID.' });
    }
    if (!name || name.length > 150) {
        return res.status(400).json({ success: false, message: 'Institution name is required and must be 150 characters or fewer.' });
    }
    if (!UNIT_TYPES.includes(unitType)) {
        return res.status(400).json({ success: false, message: 'Choose a valid institution type.' });
    }
    if (rawParentId !== null && rawParentId !== undefined && rawParentId !== '') {
        parentUnitId = Number(rawParentId);
        if (!Number.isSafeInteger(parentUnitId) || parentUnitId < 1 || parentUnitId === unitId) {
            return res.status(400).json({ success: false, message: 'Choose a valid mother institution.' });
        }
    }

    try {
        const [allUnits] = await db.execute('SELECT unit_id, parent_unit_id FROM organizational_units');
        const unitById = new Map(allUnits.map((unit) => [unit.unit_id, unit]));
        if (!unitById.has(unitId)) {
            return res.status(404).json({ success: false, message: 'Institution not found.' });
        }
        if (parentUnitId !== null) {
            if (!unitById.has(parentUnitId)) {
                return res.status(400).json({ success: false, message: 'The selected mother institution does not exist.' });
            }

            const visited = new Set();
            let ancestorId = parentUnitId;
            while (ancestorId && !visited.has(ancestorId)) {
                if (ancestorId === unitId) {
                    return res.status(400).json({ success: false, message: 'An institution cannot be its own ancestor.' });
                }
                visited.add(ancestorId);
                ancestorId = unitById.get(ancestorId)?.parent_unit_id;
            }
        }

        const [duplicates] = await db.execute(
            `SELECT unit_id FROM organizational_units
             WHERE unit_id <> ? AND LOWER(name) = LOWER(?) AND unit_type = ? AND parent_unit_id <=> ?`,
            [unitId, name, UNIT_TYPE_CODES[unitType], parentUnitId]
        );
        if (duplicates.length) {
            return res.status(409).json({ success: false, message: 'This institution already exists under the selected mother institution.' });
        }

        await db.execute(
            `UPDATE organizational_units
             SET name = ?, unit_type = ?, parent_unit_id = ?
             WHERE unit_id = ?`,
            [name, UNIT_TYPE_CODES[unitType], parentUnitId, unitId]
        );
        const [updated] = await db.execute(
            `SELECT unit.unit_id, unit.name, ${unitTypeLabelSql('unit.unit_type')} AS unit_type, unit.parent_unit_id,
                    parent.name AS parent_name, unit.created_at,
                    (SELECT COUNT(*) FROM organizational_units child
                     WHERE child.parent_unit_id = unit.unit_id) AS child_count
             FROM organizational_units unit
             LEFT JOIN organizational_units parent ON parent.unit_id = unit.parent_unit_id
             WHERE unit.unit_id = ?`,
            [unitId]
        );
        res.json({ success: true, message: 'Institution updated successfully.', data: updated[0] });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'This institution already exists under the selected mother institution.' });
        }
        next(error);
    }
});

router.post('/', requirePermission('events.add'), async (req, res, next) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const unitType = typeof req.body?.unit_type === 'string' ? req.body.unit_type : '';
    const rawParentId = req.body?.parent_unit_id;

    if (!name || name.length > 150) {
        return res.status(400).json({ success: false, message: 'Institution name is required and must be 150 characters or fewer.' });
    }
    if (!UNIT_TYPES.includes(unitType)) {
        return res.status(400).json({ success: false, message: 'Choose a valid institution type.' });
    }

    let parentUnitId = null;
    if (rawParentId !== null && rawParentId !== undefined && rawParentId !== '') {
        parentUnitId = Number(rawParentId);
        if (!Number.isSafeInteger(parentUnitId) || parentUnitId < 1) {
            return res.status(400).json({ success: false, message: 'Choose a valid parent institution.' });
        }
    }

    try {
        if (parentUnitId !== null) {
            const [parents] = await db.execute(
                'SELECT unit_id FROM organizational_units WHERE unit_id = ?',
                [parentUnitId]
            );
            if (!parents.length) {
                return res.status(400).json({ success: false, message: 'The selected parent institution does not exist.' });
            }
        }

        const [duplicates] = await db.execute(
            `SELECT unit_id FROM organizational_units
             WHERE LOWER(name) = LOWER(?) AND unit_type = ? AND parent_unit_id <=> ?`,
            [name, UNIT_TYPE_CODES[unitType], parentUnitId]
        );
        if (duplicates.length) {
            return res.status(409).json({ success: false, message: 'This institution already exists under the selected parent.' });
        }

        const [result] = await db.execute(
            `INSERT INTO organizational_units (name, unit_type, parent_unit_id)
             VALUES (?, ?, ?)`,
            [name, UNIT_TYPE_CODES[unitType], parentUnitId]
        );
        const [created] = await db.execute(
            `SELECT child.unit_id, child.name, ${unitTypeLabelSql('child.unit_type')} AS unit_type, child.parent_unit_id,
                    parent.name AS parent_name
             FROM organizational_units child
             LEFT JOIN organizational_units parent ON parent.unit_id = child.parent_unit_id
             WHERE child.unit_id = ?`,
            [result.insertId]
        );
        res.status(201).json({ success: true, message: 'Institution created successfully.', data: created[0] });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'This institution already exists under the selected parent.' });
        }
        next(error);
    }
});

module.exports = router;
