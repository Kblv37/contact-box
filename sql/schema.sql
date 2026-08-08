-- Contact Manager schema for Neon / PostgreSQL
-- Run this once against your Neon database (psql or the Neon SQL editor).

CREATE TABLE IF NOT EXISTS contacts (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL,
    phone      TEXT        NOT NULL,
    note       TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional: speed up search by name / phone / note
CREATE INDEX IF NOT EXISTS idx_contacts_name  ON contacts (name);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts (phone);

-- Optional seed data
-- INSERT INTO contacts (name, phone, note) VALUES
--   ('Alice', '+1 555 0100', 'Work colleague'),
--   ('Bob',   '+1 555 0200', 'Gym buddy');
