-- Audit log for board mutations
CREATE TABLE IF NOT EXISTS board_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,         -- refers to boards.id or rowid (see code)
  actor TEXT NOT NULL,               -- who did it (email, service token, etc.)
  action TEXT NOT NULL,              -- create|update|set_primary|delete|restore
  prev TEXT,                         -- JSON before
  next TEXT,                         -- JSON after
  ts   INTEGER NOT NULL              -- epoch millis
);

-- Helpful lookups
CREATE INDEX IF NOT EXISTS idx_board_events_board_id ON board_events(board_id);
CREATE INDEX IF NOT EXISTS idx_board_events_ts       ON board_events(ts DESC);
