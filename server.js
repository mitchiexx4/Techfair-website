const express = require('express');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

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

      if (key && (process.env[key] === undefined || process.env[key] === '')) {
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
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();
const ADMIN_USERNAME = 'Admin';
const ADMIN_PASSCODE = 'Techfair1234';
const MAX_ADMIN_DEVICE_LOGINS = 3;
const ADMIN_SESSION_TTL_HOURS = Number(process.env.ADMIN_SESSION_TTL_HOURS || 12);
const DOWNLOADABLE_EXTENSIONS = new Set([
  '.txt',
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.zip',
  '.csv'
]);
const DOWNLOAD_SECTIONS = ['Lectures', 'Fact Sheets', 'Program Proceedings'];
const DOWNLOADS_MANIFEST_PATH = path.join(__dirname, 'assets', 'downloads-manifest.json');
const ADMIN_EDITABLE_FILES = [
  'index.html',
  'pages/about.html',
  'pages/about-institution.html',
  'pages/committee.html',
  'pages/schedule.html',
  'pages/speakers.html',
  'pages/sponsors.html',
  'pages/sponsorship-benefits.html',
  'pages/exhibitor-overview.html',
  'pages/awards-judging.html',
  'pages/downloads.html',
  'pages/portal.html'
];
const adminSessions = new Map();
const adminDeviceSessions = new Map();

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
app.use(express.json({ limit: '25mb' }));

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

function extractAdminToken(req) {
  const headerToken = (req.get('x-admin-token') || '').trim();
  if (headerToken) return headerToken;

  const authHeader = (req.get('authorization') || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return (req.query.token || '').toString().trim();
}

function extractAdminSession(req) {
  const sessionHeader = (req.get('x-admin-session') || '').trim();
  if (sessionHeader) return sessionHeader;
  return (req.query.session || '').toString().trim();
}

function buildAdminSession(username) {
  const token = crypto.randomBytes(24).toString('hex');
  const ttlMs = Math.max(1, ADMIN_SESSION_TTL_HOURS) * 60 * 60 * 1000;
  const expiresAt = Date.now() + ttlMs;
  const record = { username, expiresAt, deviceId: '' };
  adminSessions.set(token, record);
  return { token, expiresAt };
}

function cleanupExpiredAdminSessions() {
  for (const [token, session] of adminSessions.entries()) {
    if (!session || session.expiresAt <= Date.now()) {
      adminSessions.delete(token);
      if (session?.deviceId) {
        const activeToken = adminDeviceSessions.get(session.deviceId);
        if (activeToken === token) adminDeviceSessions.delete(session.deviceId);
      }
    }
  }
}

function validateAdminSession(token) {
  cleanupExpiredAdminSessions();
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(token);
    if (session.deviceId) {
      const activeToken = adminDeviceSessions.get(session.deviceId);
      if (activeToken === token) adminDeviceSessions.delete(session.deviceId);
    }
    return null;
  }
  return session;
}

function extractAdminDeviceId(req) {
  const headerDevice = (req.get('x-admin-device') || '').toString().trim();
  if (headerDevice) return headerDevice;
  return (req.body?.deviceId || '').toString().trim();
}

function isAllowedEditableFile(filePath) {
  const normalized = (filePath || '').toString().replace(/\\/g, '/').trim();
  return ADMIN_EDITABLE_FILES.includes(normalized);
}

function resolveEditableAbsolutePath(filePath) {
  if (!isAllowedEditableFile(filePath)) return '';
  return path.join(__dirname, filePath);
}

function isDownloadableAssetName(fileName) {
  const safeName = (fileName || '').toString().trim();
  if (!safeName) return false;
  if (safeName.includes('/') || safeName.includes('\\') || safeName.includes('..')) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(safeName)) return false;
  const ext = path.extname(safeName).toLowerCase();
  return DOWNLOADABLE_EXTENSIONS.has(ext);
}

function normalizeDownloadSection(section, fileName = '') {
  const clean = (section || '').toString().trim();
  if (DOWNLOAD_SECTIONS.includes(clean)) return clean;

  const lowerName = (fileName || '').toString().toLowerCase();
  if (lowerName.includes('lecture')) return 'Lectures';
  if (lowerName.includes('fact')) return 'Fact Sheets';
  if (lowerName.includes('proceeding') || lowerName.includes('schedule')) return 'Program Proceedings';
  return 'Lectures';
}

async function readDownloadsManifest() {
  try {
    const raw = await fs.promises.readFile(DOWNLOADS_MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

async function writeDownloadsManifest(manifest) {
  const safe = manifest && typeof manifest === 'object' ? manifest : {};
  const body = JSON.stringify(safe, null, 2);
  await fs.promises.writeFile(DOWNLOADS_MANIFEST_PATH, body, 'utf8');
}

async function listDownloadableAssets() {
  const manifest = await readDownloadsManifest();
  const assetsDir = path.join(__dirname, 'assets');
  let names = [];
  try {
    names = await fs.promises.readdir(assetsDir);
  } catch {
    return [];
  }

  const files = [];
  for (const fileName of names) {
    if (!isDownloadableAssetName(fileName)) continue;
    const abs = path.join(assetsDir, fileName);
    try {
      const stat = await fs.promises.stat(abs);
      if (!stat.isFile()) continue;
      files.push({
        fileName,
        url: `/assets/${fileName}`,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        section: normalizeDownloadSection(manifest[fileName]?.section, fileName)
      });
    } catch {
      // Ignore files that disappear during listing.
    }
  }

  files.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return files;
}

function requireAdmin(req, res, next) {
  const adminSession = validateAdminSession(extractAdminSession(req));
  if (adminSession) {
    req.admin = { username: adminSession.username, via: 'session' };
    return next();
  }

  if (!ADMIN_TOKEN) {
    return res.status(503).json({
      ok: false,
      error: 'Admin access is not configured. Set ADMIN_TOKEN on the server.'
    });
  }

  const token = extractAdminToken(req);
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized admin request.' });
  }

  req.admin = { username: 'token-admin', via: 'token' };
  next();
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

app.post('/api/admin/login', (req, res) => {
  const { username, passcode } = req.body || {};
  const cleanUsername = (username || '').toString().trim();
  const cleanPasscode = (passcode || '').toString();
  const deviceId = extractAdminDeviceId(req);

  if (!deviceId || deviceId.length < 8 || deviceId.length > 128) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid device identifier.' });
  }

  if (cleanUsername !== ADMIN_USERNAME || cleanPasscode !== ADMIN_PASSCODE) {
    return res.status(401).json({ ok: false, error: 'Invalid admin credentials.' });
  }

  cleanupExpiredAdminSessions();
  const existingTokenForDevice = adminDeviceSessions.get(deviceId);
  if (!existingTokenForDevice && adminDeviceSessions.size >= MAX_ADMIN_DEVICE_LOGINS) {
    return res.status(403).json({
      ok: false,
      error: 'Maximum allowed admin logins reached (3 devices). Log out from another device first.'
    });
  }

  if (existingTokenForDevice) {
    adminSessions.delete(existingTokenForDevice);
  }

  const session = buildAdminSession(cleanUsername);
  const sessionRecord = adminSessions.get(session.token);
  if (sessionRecord) {
    sessionRecord.deviceId = deviceId;
    adminSessions.set(session.token, sessionRecord);
  }
  adminDeviceSessions.set(deviceId, session.token);

  res.json({
    ok: true,
    sessionToken: session.token,
    expiresAt: new Date(session.expiresAt).toISOString(),
    admin: {
      username: cleanUsername,
      devicesInUse: adminDeviceSessions.size,
      maxDevices: MAX_ADMIN_DEVICE_LOGINS
    }
  });
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ ok: true, admin: req.admin || null });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = extractAdminSession(req);
  if (token) {
    const session = adminSessions.get(token);
    adminSessions.delete(token);
    if (session?.deviceId) {
      const activeToken = adminDeviceSessions.get(session.deviceId);
      if (activeToken === token) adminDeviceSessions.delete(session.deviceId);
    }
  }
  res.json({ ok: true });
});

app.get('/api/admin/registrations', requireAdmin, async (req, res) => {
  try {
    const category = (req.query.category || '').toString().trim();

    const baseSql = `
      SELECT
        tag_id AS tag,
        full_name AS name,
        email,
        phone,
        org,
        category AS track,
        photo_data AS photo,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM ${REG_TABLE}
    `;

    let sql = `${baseSql} ORDER BY created_at DESC`;
    let params = [];
    if (category) {
      sql = `${baseSql} WHERE category = ? ORDER BY created_at DESC`;
      params = [category];
    }

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, registrations: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Failed to fetch registrations for admin.' });
  }
});

app.get('/api/downloads/files', async (_req, res) => {
  try {
    const files = await listDownloadableAssets();
    res.json({ ok: true, files });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to list downloadable files.' });
  }
});

app.get('/api/admin/content/files', requireAdmin, async (_req, res) => {
  try {
    const files = ADMIN_EDITABLE_FILES.map((filePath) => ({
      path: filePath,
      title: path.basename(filePath)
    }));
    const assets = await listDownloadableAssets();
    res.json({ ok: true, files, assets, downloadSections: DOWNLOAD_SECTIONS });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to load admin file list.' });
  }
});

app.get('/api/admin/content/file', requireAdmin, async (req, res) => {
  try {
    const filePath = (req.query.path || '').toString().trim();
    const abs = resolveEditableAbsolutePath(filePath);
    if (!abs) return res.status(400).json({ ok: false, error: 'File is not editable in admin panel.' });

    const body = await fs.promises.readFile(abs, 'utf8');
    res.json({ ok: true, path: filePath, content: body });
  } catch (error) {
    res.status(500).json({ ok: false, error: `Failed to read file: ${error.message}` });
  }
});

app.put('/api/admin/content/file', requireAdmin, async (req, res) => {
  try {
    const filePath = (req.body?.path || '').toString().trim();
    const content = (req.body?.content || '').toString();
    const abs = resolveEditableAbsolutePath(filePath);
    if (!abs) return res.status(400).json({ ok: false, error: 'File is not editable in admin panel.' });

    await fs.promises.writeFile(abs, content, 'utf8');
    res.json({ ok: true, path: filePath });
  } catch (error) {
    res.status(500).json({ ok: false, error: `Failed to save file: ${error.message}` });
  }
});

app.post('/api/admin/content/assets', requireAdmin, async (req, res) => {
  try {
    const fileName = (req.body?.fileName || '').toString().trim();
    const contentBase64 = (req.body?.contentBase64 || '').toString();
    const section = normalizeDownloadSection(req.body?.section, fileName);
    if (!isDownloadableAssetName(fileName)) {
      return res.status(400).json({
        ok: false,
        error: 'Unsupported file type or invalid filename. Use letters/numbers and a document extension.'
      });
    }
    if (!contentBase64) {
      return res.status(400).json({ ok: false, error: 'File content is required.' });
    }

    const assetsDir = path.join(__dirname, 'assets');
    const abs = path.join(assetsDir, fileName);
    const buffer = Buffer.from(contentBase64, 'base64');
    await fs.promises.writeFile(abs, buffer);

    const manifest = await readDownloadsManifest();
    manifest[fileName] = { section };
    await writeDownloadsManifest(manifest);

    res.json({ ok: true, fileName, url: `/assets/${fileName}`, section });
  } catch (error) {
    res.status(500).json({ ok: false, error: `Failed to upload file: ${error.message}` });
  }
});

app.delete('/api/admin/content/assets/:fileName', requireAdmin, async (req, res) => {
  try {
    const fileName = decodeURIComponent(req.params.fileName || '').trim();
    if (!isDownloadableAssetName(fileName)) {
      return res.status(400).json({ ok: false, error: 'Invalid file name.' });
    }
    const abs = path.join(__dirname, 'assets', fileName);
    await fs.promises.unlink(abs);

    const manifest = await readDownloadsManifest();
    if (manifest[fileName]) {
      delete manifest[fileName];
      await writeDownloadsManifest(manifest);
    }

    res.json({ ok: true, fileName });
  } catch (error) {
    res.status(500).json({ ok: false, error: `Failed to delete file: ${error.message}` });
  }
});

app.use(express.static(path.join(__dirname)));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pages/portal', (_req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'portal.html'));
});

app.get('/pages/admin-tags', (_req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'admin-tags.html'));
});

app.get('/pages/admin-login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'admin-login.html'));
});

app.get('/pages/admin-dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'admin-dashboard.html'));
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
