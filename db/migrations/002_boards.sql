-- db/migrations/002_boards.sql
-- Add boards table to support multi-link per state without breaking existing 'states' schema.

PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY,
  state_code TEXT NOT NULL REFERENCES states(code) ON DELETE CASCADE,
  board TEXT NOT NULL,
  url   TEXT NOT NULL,
  primary_flag INTEGER NOT NULL DEFAULT 0 CHECK (primary_flag IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_boards_state ON boards(state_code);
CREATE INDEX IF NOT EXISTS idx_boards_primary ON boards(primary_flag);

COMMIT;
