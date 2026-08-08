const { Pool } = require('pg');

let pool;
let schemaReady = null;

// Idempotent DDL — mirrors sql/schema.sql. Auto-runs on first connection so a
// fresh database works without manually executing the schema first.
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT        NOT NULL DEFAULT '',
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    phone      TEXT        NOT NULL,
    note       TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

  CREATE INDEX IF NOT EXISTS idx_contacts_name    ON contacts (name);
  CREATE INDEX IF NOT EXISTS idx_contacts_phone   ON contacts (phone);
  CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts (user_id);
`;

function getPool() {
  if (!pool) {
    if (process.env.PG_MEM === '1') {
      // In-memory PostgreSQL emulator (test/dev only, no real DB needed)
      const { newDb } = require('pg-mem');
      const memDb = newDb({ autoCreateForeignKeyIndices: true });
      memDb.public.none(SCHEMA_SQL);
      pool = new (memDb.adapters.createPg().Pool)();
      return pool;
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Unexpected idle client error', err);
    });
  }
  return pool;
}

// Ensures tables exist before the first query. Returns a shared promise so it
// only runs once.
function ensureSchema() {
  if (process.env.PG_MEM === '1') {
    return Promise.resolve();
  }
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA_SQL)
      .then(() => true)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Schema init failed:', err.message);
        return true;
      });
  }
  return schemaReady;
}

module.exports = { getPool, ensureSchema };