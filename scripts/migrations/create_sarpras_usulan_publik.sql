CREATE TABLE IF NOT EXISTS sarpras_usulan_publik (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruangan TEXT NOT NULL,
  kategori TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  klinik TEXT NOT NULL,
  kebutuhan INTEGER NOT NULL DEFAULT 0,
  keadaan INTEGER NOT NULL DEFAULT 0,
  kekurangan INTEGER NOT NULL DEFAULT 0,
  permintaan INTEGER NOT NULL DEFAULT 0,
  spesifikasi TEXT NOT NULL DEFAULT '',
  tahun INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  sarpras_id INTEGER,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sarpras_usulan_publik_ruangan_status
  ON sarpras_usulan_publik (ruangan, status, created_at);
