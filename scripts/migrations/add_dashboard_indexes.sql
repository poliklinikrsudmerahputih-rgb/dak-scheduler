CREATE INDEX IF NOT EXISTS idx_indikator_mutu_praktik_ruangan_tanggal_dokter
  ON indikator_mutu_praktik (ruangan, tanggal, dokter_id);

CREATE INDEX IF NOT EXISTS idx_jadwal_dinas_tahun_bulan_tanggal_ruangan_sdm
  ON jadwal_dinas (tahun, bulan, tanggal, ruangan, sdm_id);

CREATE INDEX IF NOT EXISTS idx_jumlah_pasien_poli_tahun_bulan_tanggal_dokter_klinik
  ON jumlah_pasien_poli (tahun, bulan, tanggal, nama_dokter, klinik);
