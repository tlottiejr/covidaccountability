-- Query helpers; no functional change
CREATE INDEX IF NOT EXISTS idx_boards_state_active ON boards(state_code, active);
CREATE INDEX IF NOT EXISTS idx_boards_state_pri    ON boards(state_code, primary_flag, active);
