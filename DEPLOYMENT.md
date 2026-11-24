# learndev.site deployment

## Frontend

Build from `frontend` with `npm ci` and `npm run build`. Publish the contents
of `frontend/dist` to the document root for `learndev.site`.

The tracked `frontend/.env.production` supplies the public API URL during
production builds. These URLs are public configuration, not credentials.
If Hostinger defines `VITE_API_BASE_URL` or `VITE_PROFILE_IMAGE_BASE_URL`, ensure
they match that file: hosting environment variables override the file.
Changing a Vite environment variable requires rebuilding the frontend.
Set `VITE_CERTIFICATE_VERIFICATION_ORIGIN` to the public frontend origin used in
printed certificate QR codes. Local development defaults to `http://172.31.20.63:5173`.
Keep local development settings in the ignored `frontend/.env`.

## Backend

Run `backend/server.js` on `api.learndev.site`. Install dependencies in
`backend` with `npm ci --omit=dev` and start with `npm start`.
Include the repository-root `resources` directory alongside `backend`.

Set the variables in `backend/.env.example` privately in the backend's
Hostinger environment settings, using the actual hosting database credentials.
The example contains placeholders and cannot connect to the database as-is.
Do not upload local development credentials or commit real credentials.
Allow Hostinger to supply `PORT`, then restart/redeploy the backend after
changing its environment. Configuring frontend variables does not configure
the separately running backend.

## Verification

### Credential email setup

New accounts and administrator password resets email the temporary password
to the user's email address instead of writing a credential text file.
New accounts now require a valid email address. Add an email address to older
phone-only accounts before using the password reset action.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASSWORD`, `SMTP_FROM`, and `APP_LOGIN_URL` in the backend's private
environment settings (see `backend/.env.example`). Use the outgoing SMTP
settings supplied by your mailbox provider and a sender it authorizes.
Port 465 normally uses `SMTP_SECURE=true`; port 587 uses `false` with required
STARTTLS. TLS certificate validation remains enabled.

Install the updated backend dependencies with `npm ci --omit=dev` and restart
the backend after configuring SMTP. Rebuild/redeploy the frontend too.
No live email is sent by the automated tests. Verify delivery with a test user
you control after setup, including their spam folder.

The database changes commit only after the SMTP server accepts the recipient.
Mail errors roll back account creation or password reset; existing passwords
remain usable after a failed reset. SMTP acceptance does not guarantee inbox
delivery. Email and MySQL cannot commit atomically: if a database commit fails
after SMTP accepts the message, the emailed password may not work. Retry the
operation in that case. Existing credential files are not automatically deleted;
remove previously generated files manually when no longer needed.

### Live checks

Signup requests are saved in `signup_requests` rather than emailed. Before
using the public form or review page, apply
`backend/migrations/034_create_signup_requests.sql` to the target database.
The Users page links to the protected Signup Requests page; only accounts
with create-user permission can read requests or update their review status.
Apply `backend/migrations/035_signup_request_account_creation.sql` before
using Create user in the request list. This allows missing phone/institution
values, and records the created account on the signup request. Create user
creates the account directly, emails its temporary password, and changes the
request to Account created. The request no longer contributes to the badge.
Missing profile details can be completed through Users later. No management
permissions are assigned automatically. Account creation and request updates
roll back if the mail server rejects the credential email. Completed requests
cannot be reopened, and duplicate emails/phone numbers cannot create another
account. Dismissed requests must be reopened before creation.

1. `https://api.learndev.site/` should return the API status JSON.
2. `https://api.learndev.site/test-db` should report `success: true`.
3. The deployed frontend JavaScript must use `https://api.learndev.site`
   and contain no `http://localhost:5000` API address.
4. Test login and profile pictures from a phone and refresh an inner page.
