CREATE TABLE IF NOT EXISTS sarpras_rawat_jalan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomor INTEGER NOT NULL,
  kategori TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  klinik TEXT NOT NULL,
  kebutuhan INTEGER NOT NULL DEFAULT 0,
  keadaan INTEGER NOT NULL DEFAULT 0,
  kekurangan INTEGER NOT NULL DEFAULT 0,
  permintaan INTEGER NOT NULL DEFAULT 0,
  spesifikasi TEXT NOT NULL DEFAULT '',
  tahun INTEGER NOT NULL DEFAULT 2026,
  ruangan TEXT NOT NULL,
  source_sheet TEXT,
  source_row INTEGER,
  source_key TEXT UNIQUE,
  created_by TEXT,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sarpras_ruangan_tahun_kategori
  ON sarpras_rawat_jalan (ruangan, tahun, kategori);

CREATE INDEX IF NOT EXISTS idx_sarpras_ruangan_klinik
  ON sarpras_rawat_jalan (ruangan, klinik);

CREATE TABLE IF NOT EXISTS sarpras_kir_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruangan TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_sheet_index INTEGER NOT NULL,
  source_sheet_name TEXT NOT NULL,
  sheet_state TEXT NOT NULL DEFAULT 'visible',
  nama_ruang TEXT NOT NULL DEFAULT '',
  kode_ruang TEXT NOT NULL DEFAULT '',
  periode_kartu TEXT NOT NULL DEFAULT '',
  record_count INTEGER NOT NULL DEFAULT 0,
  source_rows_json TEXT NOT NULL DEFAULT '[]',
  source_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sarpras_kir_sheets_ruangan
  ON sarpras_kir_sheets (ruangan, source_sheet_index);

CREATE TABLE IF NOT EXISTS sarpras_kir_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruangan TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_sheet_index INTEGER NOT NULL,
  source_sheet_name TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  nama_ruang TEXT NOT NULL DEFAULT '',
  kode_ruang TEXT NOT NULL DEFAULT '',
  periode_kartu TEXT NOT NULL DEFAULT '',
  kategori TEXT NOT NULL DEFAULT '',
  nomor_urut TEXT NOT NULL DEFAULT '',
  nama_barang TEXT NOT NULL,
  nomor_barang TEXT NOT NULL DEFAULT '',
  register TEXT NOT NULL DEFAULT '',
  merk_model TEXT NOT NULL DEFAULT '',
  no_seri_pabrik TEXT NOT NULL DEFAULT '',
  ukuran TEXT NOT NULL DEFAULT '',
  bahan TEXT NOT NULL DEFAULT '',
  warna TEXT NOT NULL DEFAULT '',
  tahun_pembuatan TEXT NOT NULL DEFAULT '',
  keadaan TEXT NOT NULL DEFAULT '',
  jumlah_barang TEXT NOT NULL DEFAULT '',
  kebutuhan_riil TEXT NOT NULL DEFAULT '',
  keterangan TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sarpras_kir_inventory_ruangan_sheet
  ON sarpras_kir_inventory (ruangan, source_sheet_index, source_row);

CREATE INDEX IF NOT EXISTS idx_sarpras_kir_inventory_ruangan_category
  ON sarpras_kir_inventory (ruangan, kategori);

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
