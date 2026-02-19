const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.PORT || 3000);
const MYSQL_URL = process.env.MYSQL_URL || '';
const REG_TABLE = 'techfair_registrations';
const SUB_TABLE = 'techfair_project_submissions';

if (!MYSQL_URL) {
  console.error('Missing MYSQL_URL environment variable.');
  console.error('Set MYSQL_URL to your MySQL connection string before starting the server.');
  process.exit(1);
}

if (MYSQL_URL.includes('YOUR_REAL_MYSQL_CONNECTION_STRING') || MYSQL_URL.includes('${{')) {
  console.error('MYSQL_URL is still a placeholder value.');
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
  console.error('MYSQL_URL is not a valid URL.');
  console.error('Expected format: mysql://username:password@host:3306/database_name');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '10mb' }));

const pool = mysql.createPool({
  uri: MYSQL_URL,
  connectionLimit: 10
});

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

    res.json({
      ok: true,
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

    const [regs] = await pool.query(`SELECT category FROM ${REG_TABLE} WHERE tag_id = ? LIMIT 1`, [tagId]);
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

    res.json({ ok: true });
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
