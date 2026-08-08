-- Contact Manager schema for Neon / PostgreSQL
-- Run this once against your Neon database (psql or the Neon SQL editor).
-- Migration-safe: can be re-run on an existing install.

-- Users (registration / login)
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT        NOT NULL DEFAULT '',
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contacts belong to a user
CREATE TABLE IF NOT EXISTS contacts (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    phone      TEXT        NOT NULL,
    note       TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration: add user_id to an existing contacts table (idempotent)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

-- Optional: speed up search by name / phone / note / owner
CREATE INDEX IF NOT EXISTS idx_contacts_name    ON contacts (name);
CREATE INDEX IF NOT EXISTS idx_contacts_phone   ON contacts (phone);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts (user_id);

-- Optional seed data
-- INSERT INTO users (name, email, password_hash) VALUES
--   ('Demo', 'demo@example.com', '<bcrypt-hash>');
--   -- generate a hash with: node -e "console.log(require('bcryptjs').hashSync('secret123', 10))"