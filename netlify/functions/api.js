const express = require('express');
const serverless = require('serverless-http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getPool, ensureSchema } = require('./db');

const app = express();
app.use(express.json());

// Make sure users/contacts tables exist before the first request touches them.
app.use(async (req, res, next) => {
  try {
    await ensureSchema();
  } catch (_) {
    /* express error handler will surface any real DB errors */
  }
  next();
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const phonePattern = /^\+?[0-9()\-\s.]{6,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- helpers ----------
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function errorHandler(err, req, res, next) {
  if (err && err.status) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err && err.code === 'ECONNREFUSED') {
    return res.status(503).json({ error: 'Database unavailable' });
  }
  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'Email already registered' });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, created_at: user.created_at };
}

// ---------- auth ----------
app.post('/auth/register', asyncHandler(async (req, res) => {
  const { name = '', email, password } = req.body || {};
  const errors = {};
  const cleanEmail = String(email ?? '').trim().toLowerCase();
  const cleanName = String(name ?? '').trim();
  const cleanPassword = String(password ?? '');

  if (!emailPattern.test(cleanEmail)) errors.email = 'A valid email is required';
  if (cleanPassword.length < 6) errors.password = 'Password must be at least 6 characters';
  else if (cleanPassword.length > 200) errors.password = 'Password must be at most 200 characters';
  if (cleanName.length > 100) errors.name = 'Name must be at most 100 characters';

  if (Object.keys(errors).length) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.details = errors;
    throw err;
  }

  const passwordHash = await bcrypt.hash(cleanPassword, 10);
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, created_at`,
    [cleanName, cleanEmail, passwordHash]
  );
  const user = rows[0];
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1',
    [String(email).trim().toLowerCase()]
  );
  const user = rows[0];
  const ok = user && (await bcrypt.compare(String(password), user.password_hash));
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.get('/auth/me', authRequired, asyncHandler(async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, email, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(publicUser(rows[0]));
}));

app.post('/auth/logout', (req, res) => {
  // Stateless JWT: the client just discards the token.
  res.status(204).end();
});

// ---------- contacts (auth required, scoped to the user) ----------
const contactsRouter = express.Router();
contactsRouter.use(authRequired);

contactsRouter.get('/', asyncHandler(async (req, res) => {
  const pool = getPool();
  const q = String(req.query.q ?? '').trim();

  let rows;
  if (q) {
    const pattern = `%${q}%`;
    const result = await pool.query(
      `SELECT id, name, phone, note, created_at
         FROM contacts
        WHERE user_id = $1
          AND (name ILIKE $2 OR phone ILIKE $2 OR note ILIKE $2)
        ORDER BY created_at DESC, id DESC`,
      [req.userId, pattern]
    );
    rows = result.rows;
  } else {
    const result = await pool.query(
      `SELECT id, name, phone, note, created_at
         FROM contacts
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC`,
      [req.userId]
    );
    rows = result.rows;
  }
  res.json(rows);
}));

contactsRouter.post('/', asyncHandler(async (req, res) => {
  const contact = normalizeContact(req.body);
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO contacts (user_id, name, phone, note)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, phone, note, created_at`,
    [req.userId, contact.name, contact.phone, contact.note]
  );
  res.status(201).json(rows[0]);
}));

contactsRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, phone, note, created_at FROM contacts WHERE id = $1 AND user_id = $2',
    [id, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
  res.json(rows[0]);
}));

contactsRouter.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const contact = normalizeContact(req.body);
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE contacts SET name = $1, phone = $2, note = $3
      WHERE id = $4 AND user_id = $5
      RETURNING id, name, phone, note, created_at`,
    [contact.name, contact.phone, contact.note, id, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
  res.json(rows[0]);
}));

contactsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const contact = normalizeContact(req.body, { partial: true });
  const pool = getPool();

  const owned = await pool.query(
    'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
    [id, req.userId]
  );
  if (owned.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

  const columns = [];
  const values = [];
  let i = 1;
  for (const key of ['name', 'phone', 'note']) {
    if (contact[key] !== undefined) {
      columns.push(`${key} = $${i++}`);
      values.push(contact[key]);
    }
  }
  if (columns.length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }
  values.push(id);
  values.push(req.userId);
  const { rows } = await pool.query(
    `UPDATE contacts SET ${columns.join(', ')} WHERE id = $${i} AND user_id = $${i + 1}
     RETURNING id, name, phone, note, created_at`,
    values
  );
  res.json(rows[0]);
}));

contactsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const pool = getPool();
  const { rowCount } = await pool.query('DELETE FROM contacts WHERE id = $1 AND user_id = $2', [id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Contact not found' });
  res.status(204).end();
}));

app.use('/contacts', contactsRouter);

app.use(errorHandler);

// ---------- validation ----------
function parseId(raw, res) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid contact id' });
    return null;
  }
  return id;
}

function normalizeContact(body, { partial = false } = {}) {
  const errors = {};
  const contact = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) errors.name = 'Name is required';
    else if (name.length > 200) errors.name = 'Name must be at most 200 characters';
    else contact.name = name;
  }

  if (!partial || body.phone !== undefined) {
    const phone = String(body.phone ?? '').trim();
    if (!phone) errors.phone = 'Phone is required';
    else if (!phonePattern.test(phone)) errors.phone = 'Phone must be 6-20 characters, digits/+-()/. and spaces only';
    else contact.phone = phone;
  }

  if (!partial || body.note !== undefined) {
    const note = String(body.note ?? '').trim();
    if (note.length > 1000) errors.note = 'Note must be at most 1000 characters';
    else contact.note = note;
  }

  if (Object.keys(errors).length) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.details = errors;
    throw err;
  }
  return contact;
}

exports.handler = serverless(app);
exports.app = app;