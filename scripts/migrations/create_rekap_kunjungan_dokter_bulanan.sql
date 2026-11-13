CREATE TABLE IF NOT EXISTS rekap_kunjungan_dokter_bulanan (
  ruangan TEXT NOT NULL,
  tahun INTEGER NOT NULL,
  bulan INTEGER NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  dokter_key TEXT NOT NULL,
  nama_dokter TEXT NOT NULL,
  jumlah INTEGER NOT NULL CHECK (jumlah >= 0),
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ruangan, tahun, bulan, dokter_key)
);

CREATE INDEX IF NOT EXISTS idx_rekap_kunjungan_bulanan_ruangan_periode
  ON rekap_kunjungan_dokter_bulanan (ruangan, tahun, bulan);
