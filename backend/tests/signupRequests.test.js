const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSignupRouter } = require('../routes/signupRequests');

const body = { first_name: 'Test', last_name: 'Person', email: 'visitor@example.test' };
function response() {
    return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, set(name, value) { this.headers[name] = value; return this; }, json(value) { this.body = value; return this; } };
}
function setup({ fail = false } = {}) {
    const saved = [];
    const router = createSignupRouter({
        database: { async execute(sql, values) {
            if (fail) throw new Error('private database diagnostic');
            saved.push({ sql, values });
            return [{ insertId: 1 }];
        } },
    });
    return { saved, handle: router.stack.find((layer) => layer.route).route.stack.at(-1).handle };
}

 test('signup request is stored without requiring institution or email delivery', async () => {
    const { saved, handle } = setup();
    const res = response();
    await handle({ ip: 'test', body }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.match(saved[0].sql, /INSERT INTO signup_requests/);
    assert.deepEqual(saved[0].values, ['Test', 'Person', body.email, null, null]);
});
test('rejects missing fields, oversized content, or multiple email recipients', async () => {
    for (const invalid of [{ ...body, first_name: '' }, { ...body, first_name: [] }, { ...body, message: 'a'.repeat(1001) }, { ...body, email: 'a@example.test,b@example.test' }]) {
        const { saved, handle } = setup();
        const res = response();
        await handle({ ip: 'test', body: invalid }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(saved.length, 0);
    }
});

test('limits repeated requests from the same client', async () => {
    const { saved, handle } = setup();
    for (let i = 0; i < 4; i += 1) {
        const res = response();
        await handle({ ip: 'test', body }, res);
        assert.equal(res.statusCode, i < 3 ? 201 : 429);
    }
    assert.equal(saved.length, 3);
});

test('database failure does not claim the request was submitted', async () => {
    const { handle } = setup({ fail: true });
    const res = response();
    await handle({ ip: 'test', body }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
    assert.doesNotMatch(res.body.message, /provider diagnostic/);
});
