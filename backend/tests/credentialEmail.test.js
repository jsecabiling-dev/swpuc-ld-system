const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCredentialMailer, isValidEmail } = require('../utils/credentialEmail');

const env = {
    SMTP_HOST: 'smtp.example.test', SMTP_PORT: '465', SMTP_SECURE: 'true',
    SMTP_USER: 'sender@example.test', SMTP_PASSWORD: 'test-only-password',
    SMTP_FROM: 'sender@example.test', APP_LOGIN_URL: 'https://example.test/login',
};
const user = { first_name: 'Test', last_name: 'Person', email: 'recipient@example.test' };

test('sends credentials only to the submitted email with secure SMTP', async () => {
    let options;
    let message;
    const send = createCredentialMailer({ env, createTransport(config) {
        options = config;
        return { async sendMail(mail) { message = mail; return { accepted: [user.email], rejected: [] }; } };
    } });
    await send(user, 'temporary-test-password');
    assert.equal(options.secure, true);
    assert.equal(options.debug, false);
    assert.equal(options.disableFileAccess, true);
    assert.deepEqual(message.to, { address: user.email });
    assert.match(message.text, /temporary-test-password/);
    assert.match(message.text, /https:\/\/example.test\/login/);
    assert.match(message.text, /must change/);
    assert.equal(message.attachments, undefined);
});

test('587 configuration requires STARTTLS and supports reset notices', async () => {
    const send = createCredentialMailer({ env: { ...env, SMTP_PORT: '587', SMTP_SECURE: 'false' }, createTransport(options) {
        assert.equal(options.secure, false);
        assert.equal(options.requireTLS, true);
        return { async sendMail(message) {
            assert.match(message.subject, /reset/);
            return { accepted: [user.email] };
        } };
    } });
    await send(user, 'test-password', { reset: true });
});

test('missing SMTP configuration fails without creating a transport', async () => {
    const send = createCredentialMailer({ env: {}, createTransport() { assert.fail('Must not send'); } });
    await assert.rejects(send(user, 'secret'), { status: 503, code: 'CREDENTIAL_EMAIL_ERROR' });
});

test('rejects missing addresses, multiple recipients and header injection', async () => {
    for (const email of ['', 'missing-at', 'one@example.test,two@example.test', 'one@example.test\r\nBcc:two@example.test']) {
        assert.equal(isValidEmail(email), false);
        const send = createCredentialMailer({ env, createTransport() { assert.fail('Must not send'); } });
        await assert.rejects(send({ ...user, email }, 'secret'), { status: 400 });
    }
});

test('SMTP rejection or failure returns a safe error without provider details', async () => {
    for (const sendMail of [
        async () => ({ accepted: [], rejected: [user.email] }),
        async () => { throw new Error('provider diagnostic containing secret'); },
    ]) {
        const send = createCredentialMailer({ env, createTransport: () => ({ sendMail }) });
        await assert.rejects(send(user, 'secret'), (error) => {
            assert.equal(error.status, 502);
            assert.equal(error.code, 'CREDENTIAL_EMAIL_ERROR');
            assert.doesNotMatch(error.message, /provider diagnostic|secret/);
            return true;
        });
    }
});
