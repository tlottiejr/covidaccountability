-- SQLite/D1-safe migration: normalize rows via AFTER triggers (no NEW.* assignments)

PRAGMA foreign_keys = ON;
PRAGMA recursive_triggers = OFF;

BEGIN;

-- Base table (idempotent)
CREATE TABLE IF NOT EXISTS states (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  link TEXT DEFAULT '',
  unavailable INTEGER DEFAULT 0 CHECK (unavailable IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_states_name ON states(name);

-- Clean up any prior trigger names we may have used
DROP TRIGGER IF EXISTS trg_states_bi;
DROP TRIGGER IF EXISTS trg_states_bu;
DROP TRIGGER IF EXISTS trg_states_ai;
DROP TRIGGER IF EXISTS trg_states_au;

-- AFTER INSERT normalizer
CREATE TRIGGER trg_states_ai
AFTER INSERT ON states
FOR EACH ROW
WHEN NEW.code <> UPPER(TRIM(NEW.code))
   OR NEW.name <> TRIM(NEW.name)
   OR NEW.link <> TRIM(COALESCE(NEW.link,''))
   OR NEW.unavailable NOT IN (0,1)
BEGIN
  UPDATE states
     SET code = UPPER(TRIM(NEW.code)),
         name = TRIM(NEW.name),
         link = TRIM(COALESCE(NEW.link,'')),
         unavailable = CASE WHEN NEW.unavailable IN (0,1) THEN NEW.unavailable ELSE 0 END
   WHERE rowid = NEW.rowid;
END;

-- AFTER UPDATE normalizer
CREATE TRIGGER trg_states_au
AFTER UPDATE ON states
FOR EACH ROW
WHEN NEW.code <> UPPER(TRIM(NEW.code))
   OR NEW.name <> TRIM(NEW.name)
   OR NEW.link <> TRIM(COALESCE(NEW.link,''))
   OR NEW.unavailable NOT IN (0,1)
BEGIN
  UPDATE states
     SET code = UPPER(TRIM(NEW.code)),
         name = TRIM(NEW.name),
         link = TRIM(COALESCE(NEW.link,'')),
         unavailable = CASE WHEN NEW.unavailable IN (0,1) THEN NEW.unavailable ELSE 0 END
   WHERE rowid = NEW.rowid;
END;

COMMIT;
