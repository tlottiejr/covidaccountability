-- Create audit table for board changes (if not exists)
CREATE TABLE IF NOT EXISTS board_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id    INTEGER NOT NULL,
  op          TEXT    NOT NULL,          -- 'create' | 'update' | 'delete' | 'primary' | etc.
  prev_json   TEXT,                       -- JSON snapshot before the change
  next_json   TEXT,                       -- JSON snapshot after the change
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (board_id) REFERENCES boards(id)
);

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_board_events_board_id_created ON board_events(board_id, created_at DESC);
