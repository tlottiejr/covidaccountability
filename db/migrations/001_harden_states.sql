-- db/migrations/001_harden_states.sql
-- Legacy-compatible states table (single-link fields retained for backward compatibility)

CREATE TABLE IF NOT EXISTS states (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  link        TEXT,                 -- legacy single-link column (kept)
  unavailable INTEGER NOT NULL DEFAULT 0,  -- legacy flag (kept)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_states_code ON states(code);
