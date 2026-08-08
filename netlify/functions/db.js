const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    if (process.env.PG_MEM === '1') {
      // In-memory PostgreSQL emulator (test/dev only, no real DB needed)
      const { newDb } = require('pg-mem');
      const memDb = newDb({ autoCreateForeignKeyIndices: true });
      memDb.public.none(`
        CREATE TABLE contacts (
          id         BIGSERIAL PRIMARY KEY,
          name       TEXT      NOT NULL,
          phone      TEXT      NOT NULL,
          note       TEXT      NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
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

module.exports = { getPool };
