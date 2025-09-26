-- Add columns expected by admin endpoints (keep legacy 'op')
ALTER TABLE board_events ADD COLUMN actor  TEXT DEFAULT 'token';
ALTER TABLE board_events ADD COLUMN action TEXT;
UPDATE board_events SET action = COALESCE(action, op);
