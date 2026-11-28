CREATE TABLE IF NOT EXISTS permohonan_tukar_jadwal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruangan TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  sdm_a_id INTEGER NOT NULL,
  sdm_a_nama TEXT NOT NULL,
  sdm_b_id INTEGER NOT NULL,
  sdm_b_nama TEXT NOT NULL,
  simbol_a TEXT,
  simbol_b TEXT,
  keterangan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Menunggu',
  dimohon_oleh_sdm_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diproses_oleh INTEGER,
  diproses_pada TEXT
);

CREATE INDEX IF NOT EXISTS idx_permohonan_tukar_ruangan_tanggal
  ON permohonan_tukar_jadwal (UPPER(TRIM(ruangan)), tanggal, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permohonan_tukar_pending_pair
  ON permohonan_tukar_jadwal (
    UPPER(TRIM(ruangan)),
    tanggal,
    CASE WHEN sdm_a_id < sdm_b_id THEN sdm_a_id ELSE sdm_b_id END,
    CASE WHEN sdm_a_id < sdm_b_id THEN sdm_b_id ELSE sdm_a_id END
  )
  WHERE status = 'Menunggu';
