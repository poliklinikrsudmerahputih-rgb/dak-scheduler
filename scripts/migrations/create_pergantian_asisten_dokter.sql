CREATE TABLE IF NOT EXISTS pergantian_asisten_dokter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruangan TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  dokter_id INTEGER NOT NULL,
  nama_dokter TEXT NOT NULL,
  klinik TEXT NOT NULL,
  asisten_awal_id INTEGER NOT NULL,
  asisten_awal_nama TEXT NOT NULL,
  asisten_pengganti_id INTEGER NOT NULL,
  asisten_pengganti_nama TEXT NOT NULL,
  alasan_pergantian TEXT NOT NULL,
  catatan_pergantian TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pergantian_asisten_dokter_tanggal
  ON pergantian_asisten_dokter (UPPER(TRIM(ruangan)), tanggal, dokter_id);

CREATE INDEX IF NOT EXISTS idx_pergantian_asisten_tanggal_ruangan
  ON pergantian_asisten_dokter (tanggal, UPPER(TRIM(ruangan)));
