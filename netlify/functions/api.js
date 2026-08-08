const express = require('express');
const serverless = require('serverless-http');
const { getPool } = require('./db');

const app = express();

app.use(express.json());

const phonePattern = /^\+?[0-9()\-\s.]{6,20}$/;

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
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

// GET /api/contacts — list all, optional ?q= search
app.get(
  '/contacts',
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const q = String(req.query.q ?? '').trim();

    let rows;
    if (q) {
      const pattern = `%${q}%`;
      const { rows: found } = await pool.query(
        `SELECT id, name, phone, note, created_at
           FROM contacts
          WHERE name ILIKE $1 OR phone ILIKE $1 OR note ILIKE $1
          ORDER BY created_at DESC, id DESC`,
        [pattern]
      );
      rows = found;
    } else {
      const { rows: all } = await pool.query(
        `SELECT id, name, phone, note, created_at
           FROM contacts
          ORDER BY created_at DESC, id DESC`
      );
      rows = all;
    }
    res.json(rows);
  })
);

// GET /api/contacts/:id
app.get(
  '/contacts/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid contact id' });
    }
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, name, phone, note, created_at FROM contacts WHERE id = $1',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json(rows[0]);
  })
);

// POST /api/contacts
app.post(
  '/contacts',
  asyncHandler(async (req, res) => {
    const contact = normalizeContact(req.body);
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO contacts (name, phone, note)
       VALUES ($1, $2, $3)
       RETURNING id, name, phone, note, created_at`,
      [contact.name, contact.phone, contact.note]
    );
    res.status(201).json(rows[0]);
  })
);

// PUT /api/contacts/:id — full update
app.put(
  '/contacts/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid contact id' });
    }
    const contact = normalizeContact(req.body);
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE contacts
          SET name = $1, phone = $2, note = $3
        WHERE id = $4
        RETURNING id, name, phone, note, created_at`,
      [contact.name, contact.phone, contact.note, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json(rows[0]);
  })
);

// PATCH /api/contacts/:id — partial update
app.patch(
  '/contacts/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid contact id' });
    }
    const contact = normalizeContact(req.body, { partial: true });
    const pool = getPool();

    const existing = await pool.query('SELECT id FROM contacts WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

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
    const { rows } = await pool.query(
      `UPDATE contacts SET ${columns.join(', ')} WHERE id = $${i}
       RETURNING id, name, phone, note, created_at`,
      values
    );
    res.json(rows[0]);
  })
);

// DELETE /api/contacts/:id
app.delete(
  '/contacts/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid contact id' });
    }
    const pool = getPool();
    const { rowCount } = await pool.query('DELETE FROM contacts WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.status(204).end();
  })
);

app.use(errorHandler);

exports.handler = serverless(app);
exports.app = app;