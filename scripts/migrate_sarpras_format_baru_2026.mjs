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
    source_no: 39,
    source_row: 59,
    kategori: "ALAT KESEHATAN",
    nama_barang: "TANG CUCUT",
    klinik: "POLI ORTOPEDI",
    jumlah: 1,
    satuan: "Buah",
    spesifikasi: "Stainless Steel",
  },
  {
    source_no: 40,
    source_row: 60,
    kategori: "ALAT KESEHATAN",
    nama_barang: "GUNTING RAWAR LUKA LANCIP",
    klinik: "POLI ORTOPEDI",
    jumlah: 10,
    satuan: "Buah",
    spesifikasi: "Stainless Steel",
  },
  {
    source_no: 41,
    source_row: 61,
    kategori: "ALAT KESEHATAN",
    nama_barang: "TIMBANGAN",
    klinik: "POLI ORTOPEDI",
    jumlah: 1,
    satuan: "Buah",
    spesifikasi: "",
  },
  {
    source_no: 82,
    source_row: 102,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "EXHAUST FAN",
    klinik: "POLI ORTOPEDI",
    jumlah: 1,
    satuan: "Buah",
    spesifikasi: "",
  },
  {
    source_no: 83,
    source_row: 103,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "EXHAUST FAN",
    klinik: "POLI GIGI KONSERVASI",
    jumlah: 1,
    satuan: "Buah",
    spesifikasi: "",
  },
  {
    source_no: 84,
    source_row: 104,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "UPS",
    klinik: "TINDAKAN EEG",
    jumlah: 1,
    satuan: "Buah",
    spesifikasi: "",
  },
  {
    source_no: 85,
    source_row: 105,
    kategori: "ALAT NON KESEHATAN",
    nama_barang: "RAK DOKUMEN",
    klinik: "SEMUA POLI KLINIK",
    jumlah: 20,
    satuan: "Buah",
    spesifikasi: "besi/stainless steel",
  },
].map((record) => ({
  ...record,
  source_key: `sarpras-2026-format-baru-row-${record.source_row}`,
  keterangan: [
    `Jumlah usulan pada sumber: ${record.jumlah} ${record.satuan}`,
    record.spesifikasi ? `Spesifikasi/justifikasi: ${record.spesifikasi}` : "",
    "Keadaan dan kekurangan tidak dicantumkan pada workbook sumber.",
  ].filter(Boolean).join("; "),
}));

const normalize = (value) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, " ")
  .trim();

const clinicAliases = new Map([
  ["POLI OBSGYN 2", "POLI KEBIDANAN 2"],
  ["BEDAH ANAK", "POLI BEDAH ANAK"],
]);

function canonicalClinic(value) {
  const clinic = normalize(value);
  return clinicAliases.get(clinic) || clinic;
}

const identityKey = (name, clinic) => `${normalize(name)}|${canonicalClinic(clinic)}`;

if (records.length !== 7 || new Set(records.map((record) => record.source_key)).size !== records.length) {
  throw new Error("Data baru harus berisi tujuh baris dengan kunci sumber yang unik.");
}
for (const record of records) {
  if (!["ALAT KESEHATAN", "ALAT NON KESEHATAN"].includes(record.kategori)
    || !record.nama_barang || !record.klinik
    || !Number.isSafeInteger(record.jumlah) || record.jumlah < 0
    || !record.satuan || record.spesifikasi.length > 2000) {
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
    sql: `SELECT source_key, nama_barang, klinik, nomor
          FROM sarpras_rawat_jalan
          WHERE UPPER(TRIM(ruangan)) = 'POLIKLINIK' AND tahun = 2026`,
  });
  const existingKeys = new Set(existingResult.rows.map((row) => row.source_key).filter(Boolean));
  const existingIdentities = new Set(
    existingResult.rows.map((row) => identityKey(row.nama_barang, row.klinik))
  );
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
  let skippedWithSourceKey = 0;

  for (const record of records) {
    if (existingKeys.has(record.source_key)) {
      skippedWithSourceKey += 1;
      skipped.push(record.nama_barang);
      continue;
    }
    if (existingIdentities.has(identityKey(record.nama_barang, record.klinik))) {
      skipped.push(record.nama_barang);
      continue;
    }

    const categoryKey = normalize(record.kategori);
    const nomor = nextNumbers.get(categoryKey) || 1;
    nextNumbers.set(categoryKey, nomor + 1);
    await transaction.execute({
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
        record.keterangan,
        "Contoh  (2)",
        record.source_row,
        record.source_key,
      ],
    });
    const identity = identityKey(record.nama_barang, record.klinik);
    existingKeys.add(record.source_key);
    existingIdentities.add(identity);
    inserted.push({
      source_no: record.source_no,
      nomor,
      kategori: record.kategori,
      nama_barang: record.nama_barang,
      klinik: record.klinik,
      jumlah: record.jumlah,
    });
  }

  const sourceKeys = records.map((record) => record.source_key);
  const verification = await transaction.execute({
    sql: `SELECT source_key, nomor, kategori, klinik, tahun, ruangan
          FROM sarpras_rawat_jalan
          WHERE source_key IN (${sourceKeys.map(() => "?").join(", ")})`,
    args: sourceKeys,
  });
  if (verification.rows.length !== inserted.length + skippedWithSourceKey) {
    throw new Error(`Verifikasi gagal: ${verification.rows.length} dari ${records.length} baris ditemukan.`);
  }
  for (const row of verification.rows) {
    if (Number(row.tahun) !== 2026 || row.ruangan !== "POLIKLINIK") {
      throw new Error(`Verifikasi tahun/ruangan gagal untuk sumber ${row.source_key}.`);
    }
  }

  await transaction.commit();
  console.log(JSON.stringify({
    sourceRows: records.length,
    insertedRows: inserted.length,
    skippedExistingRows: skipped.length,
    inserted,
  }));
} catch (error) {
  if (transaction) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Rollback migrasi sarpras format baru gagal:", rollbackError.message);
    }
  }
  console.error("Migrasi sarpras format baru gagal; transaksi dibatalkan:", error.message);
  process.exitCode = 1;
} finally {
  client.close();
}
