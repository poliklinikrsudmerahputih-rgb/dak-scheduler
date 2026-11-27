import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@libsql/client";

nextEnv.loadEnvConfig(process.cwd());

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!databaseUrl || !authToken) {
  console.error("TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN harus tersedia.");
  process.exit(1);
}

const records = [
  {
    source_sheet: "HD",
    source_row: 10,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "TROLY BELANJA",
    klinik: "RAWAT JALAN HD",
    jumlah: 1,
    satuan: "PCS",
    harga_satuan: "1200000.0",
    jumlah_harga: "1200000.0",
    spesifikasi: "UKURAN  85 x 50 x 93cm (1000 L)/ BAHAN BESI.",
    fungsi: "",
  },
  {
    source_sheet: "HD",
    source_row: 11,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "KURSI TUNGGU PASIEN",
    klinik: "RAWAT JALAN HD",
    jumlah: 3,
    satuan: "PCS",
    harga_satuan: "3000000.0",
    jumlah_harga: "9000000.0",
    spesifikasi: "KURSI TUNNGU 4 SEAT DENGAN SANDARAN. BAHAN BESI",
    fungsi: "UNTUK PENUNGGU PASIEN DAN KELUARGA PASIEN",
  },
  {
    source_sheet: "HD",
    source_row: 12,
    kategori: "ALAT KESEHATAN",
    nama_barang: "EKG",
    klinik: "RAWAT JALAN HD",
    jumlah: 1,
    satuan: "PCS",
    harga_satuan: "2.6E7",
    jumlah_harga: "2.6E7",
    spesifikasi: "MERK ONE MED",
    fungsi: "",
  },
  {
    source_sheet: "HD",
    source_row: 13,
    kategori: "ALAT KESEHATAN",
    nama_barang: "TORNIQUETE",
    klinik: "RAWAT JALAN HD",
    jumlah: 2,
    satuan: "PCS",
    harga_satuan: "50000.0",
    jumlah_harga: "100000.0",
    spesifikasi: "BAHAN KARET",
    fungsi: "",
  },
  {
    source_sheet: "HD",
    source_row: 14,
    kategori: "ALAT KESEHATAN",
    nama_barang: "TROLY TINDAKAN",
    klinik: "RAWAT JALAN HD",
    jumlah: 1,
    satuan: "PCS",
    harga_satuan: "1500000.0",
    jumlah_harga: "1500000.0",
    spesifikasi: "BAHAN STAINLES, TINGGAT 2. UKURAN 65CM x 45CM x 80 CM",
    fungsi: "UNTUK MOBILITAS TINDAKAN",
  },
  {
    source_sheet: "HD",
    source_row: 15,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "PRINTER",
    klinik: "RAWAT JALAN HD",
    jumlah: 1,
    satuan: "PCS",
    harga_satuan: "5000000.0",
    jumlah_harga: "5000000.0",
    spesifikasi: "MERK EPSON PRINT INK -TANK ALL IN ONE I6290",
    fungsi: "UNTUK PRINT SURAT KONTROL DAN RUJUKAN",
  },
  {
    source_sheet: "HD",
    source_row: 16,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "MINI KONTAINER PALTIK KECIL",
    klinik: "RAWAT JALAN HD",
    jumlah: 1,
    satuan: "PCS",
    harga_satuan: "RP. 50000",
    jumlah_harga: "RP. 50000",
    spesifikasi: "3 SUSUN BAHAN PLATIK",
    fungsi: "UNTUK MENYIMPAT OBAT-OBATAN",
  },
  {
    source_sheet: "HD",
    source_row: 17,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "MINI KONTAINER PALTIK SEDANG",
    klinik: "RAWAT JALAN HD",
    jumlah: 1,
    satuan: "PCS",
    harga_satuan: "RP. 50000",
    jumlah_harga: "RP. 50000",
    spesifikasi: "4 SUSUN BAHAN PLATIK",
    fungsi: "UNTUK MENYIMPAT OBAT-OBATAN",
  },
  {
    source_sheet: "HD",
    source_row: 18,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "MEJA MAKAN PASIEN",
    klinik: "RAWAT JALAN HD",
    jumlah: 1,
    satuan: "PCS",
    harga_satuan: "RP. 4.700.000",
    jumlah_harga: "RP. 4.700.000",
    spesifikasi: "DILENGKAPI DENGAN RODA\nDAPAT DIATUR KETINGGIANNYA",
    fungsi: "",
  },
  {
    source_sheet: "HD",
    source_row: 19,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "KURSI RODA BUNDAR TANPA SANDARAN",
    klinik: "RAWAT JALAN HD",
    jumlah: 3,
    satuan: "PCS",
    harga_satuan: "RP. 200.000",
    jumlah_harga: "RP. 600.000",
    spesifikasi: "DILENGKAPI DENGAN RODA\nDAPAT DIATUR KETINGGIANNYA",
    fungsi: "UNTUK MOBILITAS PERAWAT",
  },
].map((record) => ({
  ...record,
  source_key: `sarpras-2026-hd-row-${record.source_row}`,
}));

const dentalRecord = {
  source_sheet: "GIGI KONSERVASI",
  source_row: 10,
  nama_barang: "EXHAUST FAN",
  klinik: "POLI GIGI KONSERVASI",
  jumlah: 1,
  satuan: "PCS",
  harga_satuan: "Rp. 800.000",
  jumlah_harga: "Rp. 1.600.000",
  spesifikasi: "Ukura 8 inch dipasang di bagian bawah /dinding bagian bawaah",
  fungsi: "UNTUK MENGELURAN AEROSOL SELAMA PERAWATAN GIGI",
};

const normalize = (value) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, " ")
  .trim();

const identityKey = (name, clinic) => `${normalize(name)}|${normalize(clinic)}`;

function formatSourcePrice(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return text;
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(numeric)}`;
}

function createDescription(record, includeStockNote = true) {
  return [
    `Satuan sumber: ${record.satuan}`,
    `Harga satuan sumber: ${formatSourcePrice(record.harga_satuan)}`,
    `Jumlah harga sumber: ${formatSourcePrice(record.jumlah_harga)}`,
    record.spesifikasi ? `Spesifikasi: ${record.spesifikasi}` : "",
    record.fungsi ? `Fungsi/kegunaan: ${record.fungsi}` : "",
    includeStockNote ? "Keadaan dan kekurangan tidak dicantumkan pada workbook sumber." : "",
  ].filter(Boolean).join("; ");
}

for (const record of records) {
  if (!["ALAT KESEHATAN", "ALAT NON KESEHATAN"].includes(record.kategori)
    || !record.nama_barang || !record.klinik
    || !Number.isSafeInteger(record.jumlah) || record.jumlah < 0
    || !record.satuan || !record.harga_satuan || !record.jumlah_harga) {
    throw new Error(`Data sumber tidak valid pada baris Excel ${record.source_row}.`);
  }
}

const schemaPath = path.join(repositoryRoot, "scripts", "migrations", "create_sarpras_rawat_jalan.sql");
const schemaStatements = fs.readFileSync(schemaPath, "utf8")
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);
const client = createClient({ url: databaseUrl, authToken });
let transaction;

try {
  transaction = await client.transaction("write");
  for (const statement of schemaStatements) {
    await transaction.execute(statement);
  }

  const existingResult = await transaction.execute({
    sql: `SELECT id, source_key, kategori, nama_barang, klinik, nomor, spesifikasi
          FROM sarpras_rawat_jalan
          WHERE UPPER(TRIM(ruangan)) = 'POLIKLINIK' AND tahun = 2026`,
  });
  const existingRows = [...existingResult.rows];
  const existingKeys = new Set(existingRows.map((row) => row.source_key).filter(Boolean));
  const existingIdentities = new Set(existingRows.map((row) => identityKey(row.nama_barang, row.klinik)));
  const sequenceResult = await transaction.execute({
    sql: `SELECT kategori, COALESCE(MAX(nomor), 0) AS max_number
          FROM sarpras_rawat_jalan
          WHERE UPPER(TRIM(ruangan)) = 'POLIKLINIK' AND tahun = 2026
          GROUP BY kategori`,
  });
  const nextNumbers = new Map(
    sequenceResult.rows.map((row) => [normalize(row.kategori), Number(row.max_number) + 1])
  );
  const inserted = [];
  const skipped = [];

  for (const record of records) {
    const identity = identityKey(record.nama_barang, record.klinik);
    if (existingKeys.has(record.source_key) || existingIdentities.has(identity)) {
      skipped.push(record.nama_barang);
      continue;
    }

    const categoryKey = normalize(record.kategori);
    const nomor = nextNumbers.get(categoryKey) || 1;
    nextNumbers.set(categoryKey, nomor + 1);
    const result = await transaction.execute({
      sql: `INSERT INTO sarpras_rawat_jalan
              (nomor, kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan,
               permintaan, spesifikasi, tahun, ruangan, source_sheet, source_row, source_key)
            VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 2026, 'POLIKLINIK', ?, ?, ?)`,
      args: [
        nomor,
        record.kategori,
        record.nama_barang,
        record.klinik,
        record.jumlah,
        record.jumlah,
        createDescription(record),
        record.source_sheet,
        record.source_row,
        record.source_key,
      ],
    });
    const row = {
      id: Number(result.lastInsertRowid),
      nomor,
      kategori: record.kategori,
      nama_barang: record.nama_barang,
      klinik: record.klinik,
      jumlah: record.jumlah,
      source_key: record.source_key,
    };
    existingRows.push(row);
    existingKeys.add(record.source_key);
    existingIdentities.add(identity);
    inserted.push(row);
  }

  const dentalMatches = existingRows.filter((row) => identityKey(row.nama_barang, row.klinik)
    === identityKey(dentalRecord.nama_barang, dentalRecord.klinik));
  if (dentalMatches.length !== 1) {
    throw new Error(`Data Exhaust Fan Gigi seharusnya tepat satu baris, ditemukan ${dentalMatches.length}.`);
  }
  const dental = dentalMatches[0];
  const mergeMarker = "Formulir GIGI KONSERVASI 2026";
  const currentDescription = String(dental.spesifikasi || "");
  let dentalMerged = false;
  if (!currentDescription.includes(mergeMarker)) {
    const mergedDescription = [
      currentDescription,
      `${mergeMarker}: ${createDescription(dentalRecord, false)}`,
    ].filter(Boolean).join("; ");
    await transaction.execute({
      sql: `UPDATE sarpras_rawat_jalan
            SET spesifikasi = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND UPPER(TRIM(ruangan)) = 'POLIKLINIK'`,
      args: [mergedDescription, dental.id],
    });
    dentalMerged = true;
  }

  const sourceKeys = records.map((record) => record.source_key);
  const verification = await transaction.execute({
    sql: `SELECT source_key, nomor, kategori, nama_barang, klinik, kebutuhan, permintaan, tahun, ruangan
          FROM sarpras_rawat_jalan
          WHERE source_key IN (${sourceKeys.map(() => "?").join(", ")})`,
    args: sourceKeys,
  });
  if (verification.rows.length !== records.length) {
    throw new Error(`Verifikasi gagal: seharusnya ${records.length} baris HD, tersimpan ${verification.rows.length}.`);
  }
  for (const row of verification.rows) {
    if (Number(row.tahun) !== 2026 || row.ruangan !== "POLIKLINIK"
      || Number(row.kebutuhan) !== Number(row.permintaan)) {
      throw new Error(`Verifikasi tahun, ruangan, atau jumlah gagal untuk ${row.source_key}.`);
    }
  }

  const dentalVerification = await transaction.execute({
    sql: `SELECT COUNT(*) AS count, spesifikasi
          FROM sarpras_rawat_jalan
          WHERE UPPER(TRIM(ruangan)) = 'POLIKLINIK'
            AND tahun = 2026
            AND UPPER(TRIM(nama_barang)) = ?
            AND UPPER(TRIM(klinik)) = ?`,
    args: [dentalRecord.nama_barang, dentalRecord.klinik],
  });
  if (Number(dentalVerification.rows[0]?.count) !== 1
    || !String(dentalVerification.rows[0]?.spesifikasi || "").includes(mergeMarker)) {
    throw new Error("Verifikasi penggabungan data Exhaust Fan Gigi gagal.");
  }

  await transaction.commit();
  console.log(JSON.stringify({
    hdRows: records.length,
    insertedRows: inserted.length,
    skippedExistingRows: skipped.length,
    dentalDuplicateMerged: dentalMerged,
    items: verification.rows.map((row) => ({
      nomor: Number(row.nomor),
      kategori: row.kategori,
      nama_barang: row.nama_barang,
      klinik: row.klinik,
      jumlah: Number(row.permintaan),
      source_key: row.source_key,
    })),
  }));
} catch (error) {
  if (transaction) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Rollback migrasi sarpras HD dan gigi gagal:", rollbackError.message);
    }
  }
  console.error("Migrasi sarpras HD dan gigi gagal; transaksi dibatalkan:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
