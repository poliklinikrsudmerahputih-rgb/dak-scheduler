CREATE TABLE IF NOT EXISTS indikator_mutu_praktik (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dokter_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  ruangan TEXT NOT NULL,
  jam_mulai_aktual TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (dokter_id, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_indikator_mutu_praktik_tanggal_ruangan
  ON indikator_mutu_praktik (tanggal, ruangan);