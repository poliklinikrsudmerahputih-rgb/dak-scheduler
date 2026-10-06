-- Apply to databases where `sop` was created before approval-date fields existed.
ALTER TABLE sop ADD COLUMN tanggal_pembuatan TEXT;
ALTER TABLE sop ADD COLUMN tanggal_pengesahan TEXT;
