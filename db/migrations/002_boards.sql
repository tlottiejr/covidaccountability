-- db/migrations/002_boards.sql
-- Recreate boards with the intended schema (handles any prior partial table).

-- Remove any prior indexes/table to avoid column-mismatch errors.
DROP INDEX IF EXISTS idx_boards_state;
DROP INDEX IF EXISTS idx_boards_primary;
DROP TABLE IF EXISTS boards;

-- Create clean schema.
CREATE TABLE boards (
  id            INTEGER PRIMARY KEY,
  state_code    TEXT NOT NULL REFERENCES states(code) ON DELETE CASCADE,
  board         TEXT NOT NULL,
  url           TEXT NOT NULL,
  primary_flag  INTEGER NOT NULL DEFAULT 0 CHECK (primary_flag IN (0,1)),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_boards_state   ON boards(state_code);
CREATE INDEX idx_boards_primary ON boards(primary_flag);
