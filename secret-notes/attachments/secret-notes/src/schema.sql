CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  sort_field TEXT NOT NULL DEFAULT 'created_at',
  sort_dir TEXT NOT NULL DEFAULT 'desc'
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 2),
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  lock_hash TEXT,
  system_note INTEGER NOT NULL DEFAULT 0 CHECK (system_note IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((locked = 0 AND lock_hash IS NULL) OR (locked = 1 AND lock_hash IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS notes_owner ON notes(owner_id);
