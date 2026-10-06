-- SOP records are isolated by ruangan; public reading defaults to POLIKLINIK.
CREATE TABLE IF NOT EXISTS sop (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no_sop TEXT NOT NULL,
  judul_prosedur TEXT NOT NULL,
  link_gdrive TEXT NOT NULL,
  ruangan TEXT NOT NULL,
  klinik TEXT,
  tanggal_pembuatan TEXT,
  tanggal_pengesahan TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sop_ruangan_no_sop
  ON sop (ruangan, no_sop);
