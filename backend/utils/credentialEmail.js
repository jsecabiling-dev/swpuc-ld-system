const nodemailer = require('nodemailer');

function isValidEmail(value) {
    return typeof value === 'string' && value.length <= 150
        && /^[^\s@<>,;"\\]+@[^\s@<>,;"\\]+\.[^\s@<>,;"\\]+$/.test(value);
}

function mailError(status, message) {
    const error = new Error(message);
    error.status = status;
    error.code = 'CREDENTIAL_EMAIL_ERROR';
    return error;
}

function createMailTransport(env, createTransport = nodemailer.createTransport) {
        const port = Number(env.SMTP_PORT || 465);
        const from = env.SMTP_FROM || env.SMTP_USER;
        if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !isValidEmail(from)
            || !Number.isInteger(port) || port < 1 || port > 65535
            || (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE))) {
            throw mailError(503, 'Credential email is not configured. Ask the administrator to configure the mail settings.');
        }

        const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;
        const transport = createTransport({
            host: env.SMTP_HOST,
            port,
            secure,
            requireTLS: !secure,
            auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 20000,
            logger: false,
            debug: false,
            disableFileAccess: true,
            disableUrlAccess: true,
        });

    return { transport, from };
}

function createCredentialMailer({ env = process.env, createTransport = nodemailer.createTransport } = {}) {
    return async function sendCredentialEmail(user, password, { reset = false } = {}) {
        if (!isValidEmail(user.email)) {
            throw mailError(400, 'A valid email address is required to send account credentials.');
        }

        const { transport, from } = createMailTransport(env, createTransport);

        const loginUrl = env.APP_LOGIN_URL || 'https://learndev.site/login';
        let parsedLoginUrl;
        try { parsedLoginUrl = new URL(loginUrl); } catch { /* Report configuration error below. */ }
        if (!parsedLoginUrl || !['https:', 'http:'].includes(parsedLoginUrl.protocol)) {
            throw mailError(503, 'The sign-in URL for credential emails is not configured correctly.');
        }

        const name = [user.first_name, user.middle_name, user.last_name, user.suffix].filter(Boolean).join(' ');
        try {
            const result = await transport.sendMail({
                from: { name: 'SWPUC Learning & Development', address: from },
                to: { address: user.email },
                subject: reset ? 'Your SWPUC temporary password has been reset' : 'Your SWPUC account sign-in details',
                text: [
                    `Hello ${name || 'there'},`,
                    '',
                    reset ? 'An administrator has reset your account password.' : 'Your Learning & Development account has been created.',
                    `Sign in: ${loginUrl}`,
                    `Email: ${user.email}`,
                    `Temporary password: ${password}`,
                    '',
                    'You must change this temporary password when you first sign in.',
                    'Keep your sign-in details private. If you did not expect this email, contact your administrator.',
                ].join('\n'),
            });
            if (!result.accepted?.length || result.rejected?.length) {
                throw new Error('Recipient was not accepted by the mail server.');
            }
        } catch {
            // Do not expose provider responses or credentials in API errors/logs.
            throw mailError(502, 'The mail server could not accept the credential email. No account changes were saved. Check the mail settings and try again.');
        }
    };
}

module.exports = { createMailTransport, isValidEmail, createCredentialMailer, sendCredentialEmail: createCredentialMailer() };
