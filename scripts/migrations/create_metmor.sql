CREATE TABLE IF NOT EXISTS metmor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal TEXT NOT NULL,
  informasi TEXT NOT NULL,
  ruangan TEXT NOT NULL,
  public_token TEXT NOT NULL UNIQUE,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_metmor_ruangan_tanggal
  ON metmor (ruangan, tanggal DESC);
