-- Data sebelum pilihan Ya/Tidak diperkenalkan dianggap sebagai Ya.
-- Nilai teks Tidak yang sudah dipilih pada form baru tetap dipertahankan.
UPDATE log_imut_pasien
SET identifikasi_pra_tindakan = CASE
  WHEN UPPER(TRIM(CAST(identifikasi_pra_tindakan AS TEXT))) = 'TIDAK' THEN 'Tidak'
  ELSE 'Ya'
END;
