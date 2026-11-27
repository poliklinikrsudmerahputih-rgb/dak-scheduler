import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@libsql/client";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const seedPath = process.argv[2];
if (!seedPath) {
  console.error("Usage: node scripts/migrate_sarpras_2026.mjs <path-to-seed-json>");
  process.exit(1);
}

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!databaseUrl || !authToken) {
  console.error("TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN harus tersedia.");
  process.exit(1);
}

const records = JSON.parse(fs.readFileSync(seedPath, "utf8"));
if (!Array.isArray(records) || records.length !== 80) {
  throw new Error(`Data seed harus berisi 80 baris ALKES PER POLI; ditemukan ${records?.length ?? "format tidak valid"}.`);
}
const sourceRows = new Set();
for (const record of records) {
  if (!["ALAT KESEHATAN", "ALAT NON KESEHATAN"].includes(record.kategori)
    || !record.nama_barang || !record.klinik
    || !["nomor", "kebutuhan", "keadaan", "kekurangan", "permintaan", "source_row"]
      .every((field) => Number.isSafeInteger(record[field]) && record[field] >= 0)
    || sourceRows.has(record.source_row)) {
    throw new Error("Data seed memiliki kategori, identitas, jumlah, atau nomor baris yang tidak valid.");
  }
  sourceRows.add(record.source_row);
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

  for (const record of records) {
    const sourceKey = `sarpras-2026-alkes-per-poli-row-${record.source_row}`;
    await transaction.execute({
      sql: `INSERT INTO sarpras_rawat_jalan
              (nomor, kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan,
               permintaan, spesifikasi, tahun, ruangan, source_sheet, source_row, source_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2026, 'POLIKLINIK', 'ALKES PER POLI', ?, ?)
            ON CONFLICT(source_key) DO UPDATE SET
              nomor = excluded.nomor,
              kategori = excluded.kategori,
              nama_barang = excluded.nama_barang,
              klinik = excluded.klinik,
              kebutuhan = excluded.kebutuhan,
              keadaan = excluded.keadaan,
              kekurangan = excluded.kekurangan,
              permintaan = excluded.permintaan,
              spesifikasi = excluded.spesifikasi,
              tahun = excluded.tahun,
              ruangan = excluded.ruangan,
              source_sheet = excluded.source_sheet,
              source_row = excluded.source_row,
              updated_at = CURRENT_TIMESTAMP`,
      args: [
        record.nomor,
        record.kategori,
        record.nama_barang,
        record.klinik,
        record.kebutuhan,
        record.keadaan,
        record.kekurangan,
        record.permintaan,
        record.spesifikasi,
        record.source_row,
        sourceKey,
      ],
    });
  }

  const verification = await transaction.execute({
    sql: `SELECT COUNT(*) AS count,
                 SUM(kebutuhan) AS total_kebutuhan,
                 SUM(permintaan) AS total_permintaan
          FROM sarpras_rawat_jalan
          WHERE source_key LIKE 'sarpras-2026-alkes-per-poli-row-%'`,
  });
  const importedCount = Number(verification.rows[0]?.count || 0);
  if (importedCount !== records.length) {
    throw new Error(`Verifikasi impor gagal: seharusnya ${records.length} baris, tersimpan ${importedCount}.`);
  }
  const categoryVerification = await transaction.execute({
    sql: `SELECT kategori, COUNT(*) AS count
          FROM sarpras_rawat_jalan
          WHERE source_key LIKE 'sarpras-2026-alkes-per-poli-row-%'
          GROUP BY kategori`,
  });
  const categoryCounts = Object.fromEntries(categoryVerification.rows.map((row) => [row.kategori, Number(row.count)]));
  if (categoryCounts["ALAT KESEHATAN"] !== 37 || categoryCounts["ALAT NON KESEHATAN"] !== 43) {
    throw new Error("Verifikasi kategori impor gagal; jumlah kategori tidak sesuai workbook.");
  }

  await transaction.commit();
  console.log(JSON.stringify({
    importedRows: importedCount,
    categoryCounts,
    totalKebutuhan: Number(verification.rows[0]?.total_kebutuhan || 0),
    totalPermintaan: Number(verification.rows[0]?.total_permintaan || 0),
    ruangan: "POLIKLINIK",
    sumber: "ALKES PER POLI",
  }));
} catch (error) {
  if (transaction) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Rollback migrasi sarpras gagal:", rollbackError.message);
    }
  }
  console.error("Migrasi sarpras gagal; transaksi dibatalkan:", error.message);
  process.exitCode = 1;
} finally {
  client.close();
}
