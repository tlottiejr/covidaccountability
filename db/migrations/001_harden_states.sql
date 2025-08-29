PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS states (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  link TEXT DEFAULT '',
  unavailable INTEGER DEFAULT 0 CHECK (unavailable IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_states_name ON states(name);

CREATE TRIGGER IF NOT EXISTS trg_states_bi
BEFORE INSERT ON states
FOR EACH ROW
BEGIN
  SELECT
    NEW.code        := UPPER(TRIM(NEW.code)),
    NEW.name        := TRIM(NEW.name),
    NEW.link        := TRIM(COALESCE(NEW.link,'')),
    NEW.unavailable := CASE WHEN NEW.unavailable IN (0,1) THEN NEW.unavailable ELSE 0 END;
END;

CREATE TRIGGER IF NOT EXISTS trg_states_bu
BEFORE UPDATE ON states
FOR EACH ROW
BEGIN
  SELECT
    NEW.code        := UPPER(TRIM(NEW.code)),
    NEW.name        := TRIM(NEW.name),
    NEW.link        := TRIM(COALESCE(NEW.link,'')),
    NEW.unavailable := CASE WHEN NEW.unavailable IN (0,1) THEN NEW.unavailable ELSE 0 END;
END;
