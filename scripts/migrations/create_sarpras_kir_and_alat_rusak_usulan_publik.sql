CREATE TABLE IF NOT EXISTS sarpras_kir_usulan_publik (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruangan TEXT NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  inventory_id INTEGER,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sarpras_kir_usulan_ruangan_status
  ON sarpras_kir_usulan_publik (ruangan, status, created_at);

CREATE TABLE IF NOT EXISTS sarpras_alat_rusak_usulan_publik (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruangan TEXT NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  report_id INTEGER,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sarpras_alat_rusak_usulan_ruangan_status
  ON sarpras_alat_rusak_usulan_publik (ruangan, status, created_at);
