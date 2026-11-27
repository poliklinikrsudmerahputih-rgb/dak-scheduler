ALTER TABLE sarpras_alat_rusak
  ADD COLUMN poli_ruangan TEXT NOT NULL DEFAULT '';

ALTER TABLE sarpras_alat_rusak
  ADD COLUMN nama_pelapor TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sarpras_alat_rusak_ruangan_poli_tanggal
  ON sarpras_alat_rusak (ruangan, poli_ruangan, tanggal_pelaporan, tanggal_selesai);
