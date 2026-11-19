# learndev.site deployment

## Frontend

Build from `frontend` with `npm ci` and `npm run build`. Publish the contents
of `frontend/dist` to the document root for `learndev.site`.

The tracked `frontend/.env.production` supplies the public API URL during
production builds. These URLs are public configuration, not credentials.
If Hostinger defines `VITE_API_BASE_URL` or `VITE_PROFILE_IMAGE_BASE_URL`, ensure
they match that file: hosting environment variables override the file.
Changing a Vite environment variable requires rebuilding the frontend.
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

1. `https://api.learndev.site/` should return the API status JSON.
2. `https://api.learndev.site/test-db` should report `success: true`.
3. The deployed frontend JavaScript must use `https://api.learndev.site`
   and contain no `http://localhost:5000` API address.
4. Test login and profile pictures from a phone and refresh an inner page.
