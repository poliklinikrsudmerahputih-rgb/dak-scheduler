-- Migration: add SDM columns and supporting tables
-- IMPORTANT: Run on a copy/staging DB first. Test backups before applying to production.

BEGIN TRANSACTION;

-- Add new columns to `sdm` table (SQLite allows ADD COLUMN)
ALTER TABLE sdm ADD COLUMN is_aktif INTEGER DEFAULT 1;
ALTER TABLE sdm ADD COLUMN status_kerja TEXT DEFAULT 'AKTIF';
ALTER TABLE sdm ADD COLUMN ruangan_aktif TEXT;
ALTER TABLE sdm ADD COLUMN tanggal_mulai_kerja DATE;
ALTER TABLE sdm ADD COLUMN tanggal_akhir_kerja DATE;
ALTER TABLE sdm ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sdm ADD COLUMN updated_at DATETIME;
ALTER TABLE sdm ADD COLUMN created_by TEXT;
ALTER TABLE sdm ADD COLUMN updated_by TEXT;

-- Create log_aktivitas table for audit trail
CREATE TABLE IF NOT EXISTS log_aktivitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,
  entity_id TEXT,
  action TEXT,
  user_id TEXT,
  user_name TEXT,
  ruangan TEXT,
  old_value TEXT,
  new_value TEXT,
  keterangan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create table to track mutu/saldo per SDM
CREATE TABLE IF NOT EXISTS saldo_mutu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sdm_id INTEGER,
  bulan INTEGER,
  tahun INTEGER,
  poin_akhir INTEGER DEFAULT 400,
  penalti INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

-- Create history table for mutasi per SDM
CREATE TABLE IF NOT EXISTS sdm_histori_mutasi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sdm_id INTEGER,
  from_ruangan TEXT,
  to_ruangan TEXT,
  tanggal DATE,
  keterangan TEXT,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

COMMIT;

-- Notes:
-- 1) SQLite's ALTER TABLE ADD COLUMN will set the default value for existing rows.
-- 2) If you need NOT NULL constraints or complex migrations, create a new table, copy data, then rename.
-- 3) Apply this on a staging copy first; create dump/backups before running on production.
