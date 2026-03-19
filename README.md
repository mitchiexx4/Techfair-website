# Techfair-website

A website for the 2026 GIMPA SOTSS Tech Fair.

## MySQL-backed registration/submission setup

1. Install dependencies:
   `npm install`
2. Create a local `.env` file once:
   `MYSQL_URL=mysql://username:password@host:3306/database_name`
   `PORT=3000`
   `SMTP_ENABLED=true`
   `SMTP_HOST=smtp.gmail.com`
   `SMTP_PORT=587`
   `SMTP_USERNAME=your-email@gmail.com`
   `SMTP_PASSWORD=your-app-password`
   `SMTP_USE_TLS=true`
   `SMTP_USE_SSL=false`
   `SMTP_FROM_EMAIL=your-email@gmail.com`
   `SMTP_FROM_NAME=GIMPA TECH FAIR`
   `SMTP_TIMEOUT_SECONDS=30`
   `SMTP_MAX_RETRIES=3`
   `SMTP_RETRY_BACKOFF_SECONDS=1.5`
3. Start server:
   `npm start`
4. Open:
   `http://localhost:3000/pages/portal`

## Admin login + dashboard (no SQL needed)

1. Restart server:
   `npm start`
3. Open:
   `http://localhost:3000/pages/admin-login`
4. Log in and use:
   - `Generated Tags`: load all tags, print/save PDF, download CSV
   - `Website Content Editor`: update key pages (speakers, schedule, downloads, etc.)
   - `Downloads File Manager`: upload/replace/delete lecture notes and downloadable files
   - Only 3 different devices can be logged in at once



Optional fallback:
- `ADMIN_TOKEN` still works for direct token-based admin API access.

The app creates required tables automatically:
- `registrations`
- `project_submissions`

## Important note about your value

`${{ MySQL.MYSQL_URL }}` is a CI/CD template expression (for workflows), not a runtime value by itself.
Use the real MySQL connection string in `MYSQL_URL` (or `DATABASE_URL`) when running locally or on your host.

## Email confirmations

When SMTP is enabled, the server sends:
- A registration confirmation email after `/api/registrations` succeeds
- A project submission confirmation email after `/api/submissions` succeeds

The API response includes `emailSent` to indicate if the mail send succeeded.
