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
    source_row: 20,
    nama_barang: "Lemari",
    jumlah: 4,
    satuan: "buah",
    spesifikasi: "besi",
    penempatan: "Ruang Fisioterapi (diskusi), Ruang TW, Ruang OT, Ruang rekam medik",
    foto: "***Foto alat",
  },
  {
    source_row: 21,
    nama_barang: "Filling Cabinet",
    jumlah: 1,
    satuan: "buah",
    spesifikasi: "besi",
    penempatan: "Ruang psikolog",
  },
  {
    source_row: 22,
    nama_barang: "Bak sampah besar",
    jumlah: 3,
    satuan: "buah",
    spesifikasi: "plastik",
    penempatan: "Ruang tunggu pasien, selasar",
  },
  {
    source_row: 23,
    nama_barang: "Bak sampah sedang",
    jumlah: 28,
    satuan: "buah",
    spesifikasi: "plastik",
    penempatan: "Ruang tindakan OT, TW, FT, Psi, Gym, dokter, toilet pasien, toilet petugas, toilet gymnasium",
  },
  {
    source_row: 24,
    nama_barang: "Rak sepatu",
    jumlah: 7,
    satuan: "buah",
    spesifikasi: "pastik",
    penempatan: "Ruang psikolog, OT, TW (anak dan dewasa), FT anak",
  },
  {
    source_row: 25,
    nama_barang: "Jam Dinding",
    jumlah: 4,
    satuan: "buah",
    spesifikasi: "plastik",
    penempatan: "Ruang psikolog anak, ruang psikolog dewasa, ruangan fisioterapi, gymnasium",
  },
  {
    source_row: 26,
    nama_barang: "Keset",
    jumlah: 6,
    satuan: "buah",
    spesifikasi: "kain",
    penempatan: "Toilet petugas (3), toilet pasien (3)",
  },
  {
    source_row: 27,
    nama_barang: "Tempat Tisue",
    jumlah: 6,
    satuan: "buah",
    spesifikasi: "plastik",
    penempatan: "Wastafel ruangan",
  },
].map((record) => ({
  ...record,
  source_key: `sarpras-2026-rehab-medik-row-${record.source_row}`,
  keterangan: [
    `Jumlah usulan pada sumber: ${record.jumlah} ${record.satuan}`,
    `Spesifikasi/justifikasi: ${record.spesifikasi}`,
    `Rencana penempatan: ${record.penempatan}`,
    record.foto ? `Foto pada sumber: ${record.foto}` : "",
    "Keadaan dan kekurangan tidak dicantumkan pada workbook sumber.",
  ].filter(Boolean).join("; "),
}));

if (records.length !== 8 || new Set(records.map((record) => record.source_key)).size !== records.length) {
  throw new Error("Data sumber harus berisi delapan baris dengan kunci sumber yang unik.");
}
for (const record of records) {
  if (!record.nama_barang || !Number.isSafeInteger(record.jumlah) || record.jumlah < 0
    || !record.satuan || !record.spesifikasi || !record.penempatan) {
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

  const keys = records.map((record) => record.source_key);
  const existingResult = await transaction.execute({
    sql: `SELECT source_key, nomor FROM sarpras_rawat_jalan WHERE source_key IN (${keys.map(() => "?").join(", ")})`,
    args: keys,
  });
  const existingRows = new Map(existingResult.rows.map((row) => [row.source_key, Number(row.nomor)]));
  const sequenceResult = await transaction.execute({
    sql: `SELECT COALESCE(MAX(nomor), 0) AS max_number
          FROM sarpras_rawat_jalan
          WHERE UPPER(TRIM(ruangan)) = 'POLIKLINIK'
            AND UPPER(TRIM(kategori)) = 'ALAT NON KESEHATAN'
            AND tahun = 2026`,
  });
  let nextNumber = Number(sequenceResult.rows[0]?.max_number || 0) + 1;
  const inserted = [];

  for (const record of records) {
    if (existingRows.has(record.source_key)) continue;
    const nomor = nextNumber++;
    await transaction.execute({
      sql: `INSERT INTO sarpras_rawat_jalan
              (nomor, kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan,
               permintaan, spesifikasi, tahun, ruangan, source_sheet, source_row, source_key)
            VALUES (?, 'ALAT NON KESEHATAN', ?, 'REHABILITASI MEDIK', ?, 0, 0,
                    ?, ?, 2026, 'POLIKLINIK', ?, ?, ?)`,
      args: [
        nomor,
        record.nama_barang,
        record.jumlah,
        record.jumlah,
        record.keterangan,
        "Contoh  (2)",
        record.source_row,
        record.source_key,
      ],
    });
    inserted.push({ source_row: record.source_row, nomor, nama_barang: record.nama_barang });
  }

  const verification = await transaction.execute({
    sql: `SELECT source_key, nomor, kategori, klinik, tahun, ruangan
          FROM sarpras_rawat_jalan
          WHERE source_key IN (${keys.map(() => "?").join(", ")})`,
    args: keys,
  });
  if (verification.rows.length !== records.length) {
    throw new Error(`Verifikasi gagal: seharusnya ${records.length} baris, tersimpan ${verification.rows.length}.`);
  }
  for (const row of verification.rows) {
    if (row.kategori !== "ALAT NON KESEHATAN" || row.klinik !== "REHABILITASI MEDIK"
      || Number(row.tahun) !== 2026 || row.ruangan !== "POLIKLINIK") {
      throw new Error(`Verifikasi kategori/ruangan gagal untuk sumber ${row.source_key}.`);
    }
  }

  await transaction.commit();
  console.log(JSON.stringify({
    totalRows: verification.rows.length,
    insertedRows: inserted.length,
    existingRows: existingRows.size,
    numbers: verification.rows.map((row) => Number(row.nomor)).sort((left, right) => left - right),
    ruangan: "POLIKLINIK",
    klinik: "REHABILITASI MEDIK",
    tahun: 2026,
  }));
} catch (error) {
  if (transaction) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Rollback migrasi sarpras rehabilitasi medik gagal:", rollbackError.message);
    }
  }
  console.error("Migrasi sarpras rehabilitasi medik gagal; transaksi dibatalkan:", error.message);
  process.exitCode = 1;
} finally {
  client.close();
}
