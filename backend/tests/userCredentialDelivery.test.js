const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');

// Route handlers run with isolated database/mail doubles: no live users or mail.
let currentConnection;
let deliver;
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    getConnection: async () => currentConnection,
} };
const mail = require('../utils/credentialEmail');
mail.sendCredentialEmail = (...args) => deliver(...args);
const router = require('../routes/users');
const handler = (path) => router.stack.find((layer) => layer.route?.path === path && layer.route.methods.post).route.stack.at(-1).handle;
const resetPassword = handler('/:id/reset-password');

function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function setup({ email = 'recipient@example.test', failMail = false } = {}) {
    const events = [];
    let storedHash;
    let emailedPassword;
    currentConnection = {
        async beginTransaction() { events.push('begin'); },
        async execute(sql, values) {
            events.push(sql);
            if (sql.includes('FOR UPDATE')) return [[{ user_id: 2, first_name: 'Test', email, is_active: 1 }]];
            if (sql.includes('UPDATE users SET password_hash')) { storedHash = values[0]; return [{}]; }
            throw new Error('Unexpected SQL');
        },
        async commit() { events.push('commit'); },
        async rollback() { events.push('rollback'); },
        release() { events.push('release'); },
    };
    deliver = async (person, password) => {
        assert.equal(person.email, email);
        events.push('email');
        emailedPassword = password;
        if (failMail) throw Object.assign(new Error('Mail unavailable'), { status: 502, code: 'CREDENTIAL_EMAIL_ERROR' });
    };
    return { events, checkPassword: () => bcrypt.compare(emailedPassword, storedHash) };
}
const next = (error) => { throw error; };

test('signup review routes require create-user permission', () => {
    for (const path of ['/signup-requests', '/signup-requests/:id', '/signup-requests/count', '/signup-requests/:id/create-user']) {
        const route = router.stack.find((layer) => layer.route?.path === path).route;
        const res = response();
        route.stack[0].handle({ auth: { can_add_users: 0 } }, res, () => assert.fail('Must deny access'));
        assert.equal(res.statusCode, 403);
    }
});

test('phone photo uploads are staged for the originating edit session', async (t) => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-photo-upload-secret';
    t.after(() => {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    });
    require(dbPath).execute = async (_sql, [userId]) => [[{
        user_id: userId,
        active_session_id: `editor-${userId}`,
        can_edit_users: userId !== 3,
    }]];
    const headers = (userId) => ({ Authorization: `Bearer ${jwt.sign({ userId, sessionId: `editor-${userId}` }, process.env.JWT_SECRET)}` });
    const app = express();
    app.use(express.json({ limit: '7mb' }));
    app.use('/api/users', router);
    const server = await new Promise((resolve) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/users`;
    const endpoint = `${base}/42/profile-photo-uploads`;
    assert.equal((await fetch(endpoint, { method: 'POST', headers: headers(3) })).status, 403);
    const created = await fetch(endpoint, { method: 'POST', headers: headers(1) });
    assert.equal(created.status, 201);
    const { id, token } = await created.json();
    const staged = `${endpoint}/${id}`;
    assert.equal((await fetch(staged, { headers: headers(1) })).status, 204);

    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const sendPhoto = (secret) => fetch(`${base}/profile-photo-upload`, {
        method: 'PUT', body: photo, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Upload': secret },
    });
    assert.equal((await sendPhoto(`${id}.wrong`)).status, 410);
    assert.equal((await sendPhoto(token)).status, 200);
    assert.equal((await fetch(staged, { headers: headers(2) })).status, 410);
    assert.equal((await fetch(`${base}/43/profile-photo-uploads/${id}`, { headers: headers(1) })).status, 410);
    const received = await fetch(staged, { headers: headers(1) });
    assert.equal(received.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await received.arrayBuffer()), photo);
    assert.equal((await fetch(staged, { method: 'DELETE', headers: headers(1) })).status, 204);
    assert.equal((await sendPhoto(token)).status, 410);
});

function setupSignupApproval({ status = 'pending', existing = false, failMail = false, missing = false } = {}) {
    const events = [];
    const request = { request_id: 4, first_name: 'Test', last_name: 'Applicant', email: 'applicant@example.test', phone_number: null, status };
    let hash;
    let password;
    currentConnection = {
        async beginTransaction() { events.push('begin'); },
        async execute(sql, values) {
            events.push(sql);
            if (sql.includes('FROM signup_requests')) return [missing ? [] : [request]];
            if (sql.includes('SELECT user_id FROM users')) return [existing ? [{ user_id: 5 }] : []];
            if (sql.includes('INSERT INTO users')) {
                assert.equal(values[3], null);
                assert.match(sql, /NULL, TRUE, TRUE, FALSE/);
                hash = values[4];
                return [{ insertId: 99 }];
            }
            if (sql.includes('UPDATE signup_requests')) return [{}];
            throw new Error('Unexpected approval SQL');
        },
        async commit() { events.push('commit'); },
        async rollback() { events.push('rollback'); },
        release() { events.push('release'); },
    };
    deliver = async (person, temporaryPassword) => {
        assert.equal(person.email, request.email);
        events.push('email');
        password = temporaryPassword;
        if (failMail) throw Object.assign(new Error('Email unavailable'), { code: 'CREDENTIAL_EMAIL_ERROR', status: 502 });
    };
    return { events, checkPassword: () => bcrypt.compare(password, hash) };
}

test('signup approval creates an incomplete account and emails its matching temporary password', async () => {
    const { events, checkPassword } = setupSignupApproval();
    const approve = handler('/signup-requests/:id/create-user');
    const res = response();
    await approve({ params: { id: '4' } }, res, next);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.user_id, 99);
    assert.equal(res.body.password, undefined);
    assert.equal(await checkPassword(), true);
    assert.ok(events.some((sql) => sql.includes('FOR UPDATE')));
    assert.ok(events.some((sql) => sql.includes("status = 'created'")));
    assert.ok(events.indexOf('email') < events.indexOf('commit'));
});

test('signup approval rejects created/dismissed requests and existing accounts without emailing', async () => {
    const approve = handler('/signup-requests/:id/create-user');
    for (const options of [{ status: 'created' }, { status: 'dismissed' }, { existing: true }, { missing: true }]) {
        const { events } = setupSignupApproval(options);
        const res = response();
        await approve({ params: { id: '4' } }, res, next);
        assert.equal(res.statusCode, options.missing ? 404 : 409);
        assert.equal(events.includes('email'), false);
        assert.equal(events.includes('commit'), false);
        assert.equal(events.includes('rollback'), true);
    }
});

test('signup approval rolls back account and request changes when email fails', async () => {
    const { events } = setupSignupApproval({ failMail: true });
    const res = response();
    await handler('/signup-requests/:id/create-user')({ params: { id: '4' } }, res, next);
    assert.equal(res.statusCode, 502);
    assert.equal(events.includes('commit'), false);
    assert.equal(events.includes('rollback'), true);
    assert.equal(events.at(-1), 'release');
});

test('new account without institution can sign in and must change its password', async () => {
    const database = require('../config/db');
    const passwordHash = await bcrypt.hash('test-temporary-password', 4);
    database.execute = async (sql) => {
        if (sql.includes('SELECT u.*')) {
            assert.match(sql, /LEFT JOIN organizational_units/);
            return [[{ user_id: 99, first_name: 'Applicant', last_name: 'Test', email: 'applicant@example.test', password_hash: passwordHash, unit_id: null, unit_name: null, unit_type: null, must_change_password: 1 }]];
        }
        assert.match(sql, /UPDATE users SET active_session_id/);
        return [{}];
    };
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'isolated-test-secret';
    try {
        const authRouter = require('../routes/auth');
        const login = authRouter.stack.find((layer) => layer.route?.path === '/login').route.stack.at(-1).handle;
        const res = response();
        await login({ body: { identifier: 'applicant@example.test', password: 'test-temporary-password' } }, res);
        assert.equal(res.body.success, true);
        const session = require('jsonwebtoken').verify(res.body.token, process.env.JWT_SECRET);
        assert.equal(session.mustChangePassword, true);
        assert.equal(session.unitId, null);
        assert.equal(session.canAddUsers, false);
    } finally {
        if (originalSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalSecret;
    }
});

test('signup badge counts pending and reviewed requests, excluding dismissed', async () => {
    const database = require('../config/db');
    database.execute = async (sql) => {
        assert.ok(sql.includes("WHERE status IN ('pending', 'reviewed')"));
        return [[{ pending_count: '3' }]];
    };
    const count = router.stack.find((layer) => layer.route?.path === '/signup-requests/count').route.stack.at(-1).handle;
    const res = response();
    await count({}, res);
    assert.deepEqual(res.body, { success: true, pending_count: 3 });
});

test('signup review list supports pagination and validates status updates', async () => {
    const database = require('../config/db');
    const queries = [];
    database.execute = async (sql) => {
        queries.push(sql);
        return sql.includes('COUNT') ? [[{ total: 51 }]] : [[{ request_id: 1, status: 'pending' }]];
    };
    const list = router.stack.find((layer) => layer.route?.path === '/signup-requests').route.stack.at(-1).handle;
    const res = response();
    await list({ query: { page: '2' } }, res);
    assert.equal(res.body.total, 51);
    assert.equal(res.body.page, 2);
    assert.match(queries[1], /OFFSET 50/);

    const invalidPage = response();
    await list({ query: { page: '1;DROP TABLE users' } }, invalidPage);
    assert.equal(invalidPage.statusCode, 400);

    const update = router.stack.find((layer) => layer.route?.path === '/signup-requests/:id').route.stack.at(-1).handle;
    const invalidStatus = response();
    await update({ params: { id: '1' }, body: { status: 'approved' } }, invalidStatus);
    assert.equal(invalidStatus.statusCode, 400);
});

test('reset requires email and preserves the old password if mail fails', async () => {
    for (const options of [{ email: '' }, { failMail: true }]) {
        const { events } = setup(options);
        const res = response();
        await resetPassword({ params: { id: '2' }, auth: { user_id: 1 } }, res, next);
        assert.equal(res.statusCode, options.failMail ? 502 : 400);
        assert.equal(events.includes('commit'), false);
        assert.equal(events.includes('rollback'), true);
        assert.equal(events.at(-1), 'release');
    }
});

test('successful reset emails a matching password and invalidates the previous session', async () => {
    const { events, checkPassword } = setup();
    const res = response();
    await resetPassword({ params: { id: '2' }, auth: { user_id: 1 } }, res, next);
    assert.equal(res.body.success, true);
    assert.equal(await checkPassword(), true);
    assert.ok(events.some((sql) => sql.includes('active_session_id = NULL')));
    assert.ok(events.indexOf('email') < events.indexOf('commit'));
});
