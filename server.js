const express = require('express');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const mysql = require('mysql2/promise');

function loadLocalEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;

    const contents = fs.readFileSync(filePath, 'utf8');
    const lines = contents.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const idx = line.indexOf('=');
      if (idx <= 0) continue;

      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.error('Warning: failed to read .env file:', error.message);
  }
}

loadLocalEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const MYSQL_URL = process.env.MYSQL_URL || process.env.DATABASE_URL || '';
const REG_TABLE = 'techfair_registrations';
const SUB_TABLE = 'techfair_project_submissions';
const SMTP_ENABLED = parseBoolean(process.env.SMTP_ENABLED, false);
const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USERNAME = (process.env.SMTP_USERNAME || '').trim();
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const SMTP_USE_TLS = parseBoolean(process.env.SMTP_USE_TLS, true);
const SMTP_USE_SSL = parseBoolean(process.env.SMTP_USE_SSL, false);
const SMTP_FROM_EMAIL = (process.env.SMTP_FROM_EMAIL || '').trim();
const SMTP_FROM_NAME = (process.env.SMTP_FROM_NAME || 'GIMPA TECH FAIR').trim();
const SMTP_TIMEOUT_SECONDS = Number(process.env.SMTP_TIMEOUT_SECONDS || 30);
const SMTP_MAX_RETRIES = Number(process.env.SMTP_MAX_RETRIES || 3);
const SMTP_RETRY_BACKOFF_SECONDS = Number(process.env.SMTP_RETRY_BACKOFF_SECONDS || 1.5);

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function formatFromAddress() {
  if (!SMTP_FROM_EMAIL) return '';
  if (!SMTP_FROM_NAME) return SMTP_FROM_EMAIL;
  return `${SMTP_FROM_NAME} <${SMTP_FROM_EMAIL}>`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!MYSQL_URL) {
  console.error('Missing MYSQL_URL (or DATABASE_URL) environment variable.');
  console.error('Set MYSQL_URL (or DATABASE_URL) to your MySQL connection string before starting the server.');
  process.exit(1);
}

if (MYSQL_URL.includes('YOUR_REAL_MYSQL_CONNECTION_STRING') || MYSQL_URL.includes('${{')) {
  console.error('MYSQL_URL/DATABASE_URL is still a placeholder value.');
  console.error('Set it to a real connection string, for example:');
  console.error('mysql://username:password@host:3306/database_name');
  process.exit(1);
}

try {
  // Validate format early so startup errors are clearer.
  // mysql2 expects a standard URL like mysql://user:pass@host:3306/db
  // eslint-disable-next-line no-new
  new URL(MYSQL_URL);
} catch {
  console.error('MYSQL_URL/DATABASE_URL is not a valid URL.');
  console.error('Expected format: mysql://username:password@host:3306/database_name');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '10mb' }));

const pool = mysql.createPool({
  uri: MYSQL_URL,
  connectionLimit: 10
});

const smtpConfigured =
  SMTP_ENABLED &&
  !!SMTP_HOST &&
  !!SMTP_PORT &&
  !!SMTP_USERNAME &&
  !!SMTP_PASSWORD &&
  !!SMTP_FROM_EMAIL;

if (SMTP_ENABLED && !smtpConfigured) {
  console.warn(
    'SMTP is enabled but missing required settings. Emails are disabled until SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, and SMTP_FROM_EMAIL are set.'
  );
}

const mailTransporter = smtpConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_USE_SSL,
      auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
      requireTLS: SMTP_USE_TLS,
      connectionTimeout: Math.max(1, SMTP_TIMEOUT_SECONDS) * 1000
    })
  : null;

async function sendEmailWithRetry(message) {
  if (!mailTransporter) return false;

  const maxAttempts = Math.max(1, SMTP_MAX_RETRIES + 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mailTransporter.sendMail(message);
      return true;
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      const waitMs = Math.max(0, SMTP_RETRY_BACKOFF_SECONDS) * attempt * 1000;
      await sleep(waitMs);
    }
  }

  return false;
}

async function sendRegistrationConfirmation({ email, name, tag, track }) {
  if (!email) return false;
  return sendEmailWithRetry({
    from: formatFromAddress(),
    to: email,
    subject: 'GIMPA Tech Fair Registration Confirmed',
    text: `Hello ${name},

Your registration for the GIMPA SOTSS Tech Fair was successful.

Registration details:
- Tag ID: ${tag}
- Category: ${track}

Keep this Tag ID for your records.

Regards,
GIMPA TECH FAIR Team`
  });
}

async function sendSubmissionConfirmation({ email, name, tag, title }) {
  if (!email) return false;
  return sendEmailWithRetry({
    from: formatFromAddress(),
    to: email,
    subject: 'GIMPA Tech Fair Project Submission Confirmed',
    text: `Hello ${name},

Your project submission was received successfully.

Submission details:
- Tag ID: ${tag}
- Project Title: ${title}

Thank you for participating in the GIMPA SOTSS Tech Fair.

Regards,
GIMPA TECH FAIR Team`
  });
}

function normalizeTag(tag) {
  return (tag || '').toString().trim().toUpperCase();
}

function generateTag() {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TAG-${part()}${part()}`;
}

async function ensureTagUnique(candidate) {
  let tag = normalizeTag(candidate) || generateTag();
  // Retry a few times in case of collisions.
  for (let i = 0; i < 10; i += 1) {
    const [rows] = await pool.query(`SELECT tag_id FROM ${REG_TABLE} WHERE tag_id = ? LIMIT 1`, [tag]);
    if (rows.length === 0) return tag;
    tag = generateTag();
  }
  throw new Error('Could not generate a unique tag. Please retry.');
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${REG_TABLE} (
      tag_id VARCHAR(32) PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(64) NOT NULL,
      org VARCHAR(255) NULL,
      category VARCHAR(128) NOT NULL,
      photo_data LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SUB_TABLE} (
      tag_id VARCHAR(32) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      demo_url TEXT NULL,
      repo_url TEXT NOT NULL,
      tech_stack TEXT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_submission_registration
        FOREIGN KEY (tag_id)
        REFERENCES ${REG_TABLE}(tag_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    )
  `);
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Database connection failed.' });
  }
});

app.post('/api/registrations', async (req, res) => {
  try {
    const {
      tag: clientTag,
      name,
      email,
      phone,
      org = '',
      track,
      photo
    } = req.body || {};

    const fullName = (name || '').toString().trim();
    const cleanEmail = (email || '').toString().trim().toLowerCase();
    const cleanPhone = (phone || '').toString().trim();
    const category = (track || '').toString().trim();
    const photoData = (photo || '').toString().trim();

    if (!fullName || !cleanEmail || !cleanPhone || !category || !photoData) {
      return res.status(400).json({ ok: false, error: 'Name, email, phone, category and photo are required.' });
    }

    const [existingByEmail] = await pool.query(
      `SELECT tag_id FROM ${REG_TABLE} WHERE email = ? LIMIT 1`,
      [cleanEmail]
    );

    let tagId = '';
    if (existingByEmail.length > 0) {
      tagId = existingByEmail[0].tag_id;
      await pool.query(
        `UPDATE ${REG_TABLE}
         SET full_name = ?, phone = ?, org = ?, category = ?, photo_data = ?
         WHERE tag_id = ?`,
        [fullName, cleanPhone, org, category, photoData, tagId]
      );
    } else {
      tagId = await ensureTagUnique(clientTag);
      await pool.query(
        `INSERT INTO ${REG_TABLE} (tag_id, full_name, email, phone, org, category, photo_data)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tagId, fullName, cleanEmail, cleanPhone, org, category, photoData]
      );
    }

    let emailSent = false;
    try {
      emailSent = await sendRegistrationConfirmation({
        email: cleanEmail,
        name: fullName,
        tag: tagId,
        track: category
      });
    } catch (mailError) {
      console.error('Failed to send registration confirmation email:', mailError.message);
    }

    res.json({
      ok: true,
      emailSent,
      registration: {
        tag: tagId,
        name: fullName,
        email: cleanEmail,
        phone: cleanPhone,
        org,
        track: category,
        photo: photoData
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: `Failed to save registration: ${error.message}` });
  }
});

app.get('/api/registrations/:tag', async (req, res) => {
  try {
    const tag = normalizeTag(req.params.tag);
    if (!tag) return res.status(400).json({ ok: false, error: 'Tag is required.' });

    const [rows] = await pool.query(
      `SELECT tag_id AS tag, full_name AS name, email, phone, org, category AS track, photo_data AS photo
       FROM ${REG_TABLE}
       WHERE tag_id = ?
       LIMIT 1`,
      [tag]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Registration not found.' });
    }

    res.json({ ok: true, registration: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Failed to fetch registration.' });
  }
});

app.post('/api/submissions', async (req, res) => {
  try {
    const { tag, title, desc, demo = '', repo, stack = '' } = req.body || {};
    const tagId = normalizeTag(tag);
    const cleanTitle = (title || '').toString().trim();
    const cleanDesc = (desc || '').toString().trim();
    const cleanDemo = (demo || '').toString().trim();
    const cleanRepo = (repo || '').toString().trim();
    const cleanStack = (stack || '').toString().trim();

    if (!tagId || !cleanTitle || !cleanDesc || !cleanRepo) {
      return res.status(400).json({ ok: false, error: 'Tag ID, title, description and repository are required.' });
    }

    const [regs] = await pool.query(
      `SELECT category, email, full_name FROM ${REG_TABLE} WHERE tag_id = ? LIMIT 1`,
      [tagId]
    );
    if (regs.length === 0) {
      return res.status(404).json({ ok: false, error: 'Tag ID not found.' });
    }
    if (regs[0].category !== 'Exhibitor') {
      return res.status(403).json({ ok: false, error: 'Only Exhibitor registrations can submit projects.' });
    }

    await pool.query(
      `INSERT INTO ${SUB_TABLE} (tag_id, title, description, demo_url, repo_url, tech_stack)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         description = VALUES(description),
         demo_url = VALUES(demo_url),
         repo_url = VALUES(repo_url),
         tech_stack = VALUES(tech_stack),
         updated_at = CURRENT_TIMESTAMP`,
      [tagId, cleanTitle, cleanDesc, cleanDemo, cleanRepo, cleanStack]
    );

    let emailSent = false;
    try {
      emailSent = await sendSubmissionConfirmation({
        email: regs[0].email,
        name: regs[0].full_name,
        tag: tagId,
        title: cleanTitle
      });
    } catch (mailError) {
      console.error('Failed to send submission confirmation email:', mailError.message);
    }

    res.json({ ok: true, emailSent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Failed to save submission.' });
  }
});

app.get('/api/submissions/:tag', async (req, res) => {
  try {
    const tagId = normalizeTag(req.params.tag);
    if (!tagId) return res.status(400).json({ ok: false, error: 'Tag ID is required.' });

    const [rows] = await pool.query(
      `SELECT
         tag_id AS tag,
         title,
         description AS \`desc\`,
         demo_url AS demo,
         repo_url AS repo,
         tech_stack AS stack,
         updated_at AS updatedAt
       FROM ${SUB_TABLE}
       WHERE tag_id = ?
       LIMIT 1`,
      [tagId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'No submission found for this tag.' });
    }

    res.json({ ok: true, submission: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Failed to fetch submission.' });
  }
});

app.use(express.static(path.join(__dirname)));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pages/portal', (_req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'portal.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Unexpected server error.' });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
