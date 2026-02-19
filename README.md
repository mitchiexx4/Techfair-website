# Techfair-website

A website for the 2026 GIMPA SOTSS Tech Fair.

## MySQL-backed registration/submission setup

1. Install dependencies:
   `npm install`
2. Set your environment variable (PowerShell):
   `$env:MYSQL_URL="mysql://username:password@host:3306/database_name"`
3. Start server:
   `npm start`
4. Open:
   `http://localhost:3000/pages/portal`

The app creates required tables automatically:
- `registrations`
- `project_submissions`

## Important note about your value

`${{ MySQL.MYSQL_URL }}` is a CI/CD template expression (for workflows), not a runtime value by itself.
Use the real MySQL connection string in `MYSQL_URL` when running locally or on your host.
