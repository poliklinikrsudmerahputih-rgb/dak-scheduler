CREATE TABLE IF NOT EXISTS sarpras_alat_rusak (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruangan TEXT NOT NULL,
  nomor INTEGER NOT NULL,
  tanggal_pelaporan TEXT NOT NULL,
  poli_ruangan TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  deskripsi_kerusakan TEXT NOT NULL,
  nama_pelapor TEXT NOT NULL,
  petugas_ipsrs TEXT NOT NULL,
  tanggal_selesai TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ruangan, nomor)
);

CREATE INDEX IF NOT EXISTS idx_sarpras_alat_rusak_ruangan_tanggal
  ON sarpras_alat_rusak (ruangan, poli_ruangan, tanggal_pelaporan, tanggal_selesai);
