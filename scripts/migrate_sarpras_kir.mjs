import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@libsql/client";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = process.argv[2];
if (!seedPath) {
  console.error("Usage: node scripts/migrate_sarpras_kir.mjs <path-to-seed-json>");
  process.exit(1);
}

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!databaseUrl || !authToken) {
  console.error("TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN harus tersedia.");
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
if (!seed || typeof seed.source_file !== "string" || !Array.isArray(seed.sheets) || seed.sheets.length !== 49) {
  throw new Error("Seed KIR harus berisi nama file sumber dan seluruh 49 sheet.");
}

const expectedCategories = {
  "ALAT KESEHATAN": 573,
  "ALAT MEDIS": 25,
  "ALAT NON KESEHATAN": 6,
  "ALAT NON MEDIS": 680,
};
const sheetIndexes = new Set();
const sheetNames = new Set();
const assets = [];
for (const sheet of seed.sheets) {
  if (!Number.isSafeInteger(sheet.source_sheet_index)
    || sheet.source_sheet_index < 1
    || typeof sheet.source_sheet !== "string"
    || !Array.isArray(sheet.source_rows)
    || !Array.isArray(sheet.items)
    || sheetIndexes.has(sheet.source_sheet_index)
    || sheetNames.has(sheet.source_sheet)) {
    throw new Error("Metadata sheet pada seed tidak valid atau duplikat.");
  }
  sheetIndexes.add(sheet.source_sheet_index);
  sheetNames.add(sheet.source_sheet);

  for (const item of sheet.items) {
    if (!Number.isSafeInteger(item.source_row)
      || item.source_row < 1
      || !item.nomor_urut
      || !item.nama_barang
      || !Object.hasOwn(expectedCategories, item.kategori)) {
      throw new Error(`Data inventaris pada sheet ${sheet.source_sheet} tidak valid.`);
    }
    assets.push({ sheet, item });
  }
}

const categoryCounts = Object.fromEntries(Object.keys(expectedCategories).map((category) => [category, 0]));
const sourceKeys = new Set();
for (const { sheet, item } of assets) {
  categoryCounts[item.kategori]++;
  const sourceKey = `kir-jan-2026-sheet-${sheet.source_sheet_index}-row-${item.source_row}`;
  if (sourceKeys.has(sourceKey)) {
    throw new Error(`Kunci sumber ganda: ${sourceKey}`);
  }
  sourceKeys.add(sourceKey);
}
if (assets.length !== 1284
  || Object.entries(expectedCategories).some(([category, count]) => categoryCounts[category] !== count)) {
  throw new Error(`Jumlah data seed tidak sesuai workbook: ${JSON.stringify({ assets: assets.length, categoryCounts })}`);
}

const schemaPath = path.join(repositoryRoot, "scripts", "migrations", "create_sarpras_rawat_jalan.sql");
const schemaStatements = fs.readFileSync(schemaPath, "utf8")
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);
const sourceFile = seed.source_file;
const statements = schemaStatements.map((sql) => ({ sql }));

for (const sheet of seed.sheets) {
  statements.push({
    sql: `INSERT INTO sarpras_kir_sheets
            (ruangan, source_file, source_sheet_index, source_sheet_name, sheet_state,
             nama_ruang, kode_ruang, periode_kartu, record_count, source_rows_json, source_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_key) DO UPDATE SET
            ruangan = excluded.ruangan,
            source_file = excluded.source_file,
            source_sheet_index = excluded.source_sheet_index,
            source_sheet_name = excluded.source_sheet_name,
            sheet_state = excluded.sheet_state,
            nama_ruang = excluded.nama_ruang,
            kode_ruang = excluded.kode_ruang,
            periode_kartu = excluded.periode_kartu,
            record_count = excluded.record_count,
            source_rows_json = excluded.source_rows_json`,
    args: [
      "POLIKLINIK",
      sourceFile,
      sheet.source_sheet_index,
      sheet.source_sheet,
      sheet.sheet_state || "visible",
      sheet.nama_ruang || "",
      sheet.kode_ruang || "",
      sheet.periode_kartu || "",
      sheet.items.length,
      JSON.stringify(sheet.source_rows),
      `kir-jan-2026-sheet-${sheet.source_sheet_index}`,
    ],
  });
}

for (const { sheet, item } of assets) {
  statements.push({
    sql: `INSERT INTO sarpras_kir_inventory
            (ruangan, source_file, source_sheet_index, source_sheet_name, source_row, source_key,
             nama_ruang, kode_ruang, periode_kartu, kategori, nomor_urut, nama_barang,
             nomor_barang, register, merk_model, no_seri_pabrik, ukuran, bahan, warna,
             tahun_pembuatan, keadaan, jumlah_barang, kebutuhan_riil, keterangan)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_key) DO NOTHING`,
    args: [
      "POLIKLINIK",
      sourceFile,
      sheet.source_sheet_index,
      sheet.source_sheet,
      item.source_row,
      `kir-jan-2026-sheet-${sheet.source_sheet_index}-row-${item.source_row}`,
      sheet.nama_ruang || "",
      sheet.kode_ruang || "",
      sheet.periode_kartu || "",
      item.kategori,
      item.nomor_urut,
      item.nama_barang,
      item.nomor_barang || "",
      item.register || "",
      item.merk_model || "",
      item.no_seri_pabrik || "",
      item.ukuran || "",
      item.bahan || "",
      item.warna || "",
      item.tahun_pembuatan || "",
      item.keadaan || "",
      item.jumlah_barang || "",
      item.kebutuhan_riil || "",
      item.keterangan || "",
    ],
  });
}

const client = createClient({ url: databaseUrl, authToken });
try {
  await client.batch(statements, "write");

  const [inventoryVerification, sheetsVerification, categoryVerification, sheetCountsVerification, editedRecordsVerification, sourceSeparation] = await Promise.all([
    client.execute({
      sql: `SELECT COUNT(*) AS count
            FROM sarpras_kir_inventory
            WHERE source_key LIKE 'kir-jan-2026-sheet-%-row-%'
              AND UPPER(TRIM(ruangan)) = 'POLIKLINIK'`,
    }),
    client.execute({
      sql: `SELECT source_sheet_index, source_sheet_name, record_count, source_rows_json
            FROM sarpras_kir_sheets
            WHERE source_file = ? AND UPPER(TRIM(ruangan)) = 'POLIKLINIK'`,
      args: [sourceFile],
    }),
    client.execute({
      sql: `SELECT kategori, COUNT(*) AS count
            FROM sarpras_kir_inventory
            WHERE source_key LIKE 'kir-jan-2026-sheet-%-row-%'
              AND UPPER(TRIM(ruangan)) = 'POLIKLINIK'
            GROUP BY kategori`,
    }),
    client.execute({
      sql: `SELECT source_sheet_index, COUNT(*) AS count
            FROM sarpras_kir_inventory
            WHERE source_key LIKE 'kir-jan-2026-sheet-%-row-%'
              AND UPPER(TRIM(ruangan)) = 'POLIKLINIK'
            GROUP BY source_sheet_index`,
    }),
    client.execute({
      sql: `SELECT COUNT(*) AS count
            FROM sarpras_kir_inventory
            WHERE source_key LIKE 'kir-jan-2026-sheet-%-row-%'
              AND source_file = 'Diedit manual (KIR JANUARI 2026.xlsx)'
              AND UPPER(TRIM(ruangan)) = 'POLIKLINIK'`,
    }),
    client.execute({
      sql: `SELECT COUNT(*) AS count
            FROM sarpras_rawat_jalan
            WHERE source_key LIKE 'sarpras-2026-alkes-per-poli-row-%'`,
    }),
  ]);
  const importedAssets = Number(inventoryVerification.rows[0]?.count || 0);
  const importedSheets = sheetsVerification.rows.length;
  const existingProposals = Number(sourceSeparation.rows[0]?.count || 0);
  const editedRecords = Number(editedRecordsVerification.rows[0]?.count || 0);
  const importedCategoryCounts = Object.fromEntries(
    categoryVerification.rows.map((row) => [row.kategori, Number(row.count)])
  );
  const importedSheetCounts = new Map(
    sheetCountsVerification.rows.map((row) => [Number(row.source_sheet_index), Number(row.count)])
  );
  const expectedSheets = new Map(seed.sheets.map((sheet) => [sheet.source_sheet_index, sheet]));
  const sheetContentMatches = sheetsVerification.rows.every((row) => {
    const expected = expectedSheets.get(Number(row.source_sheet_index));
    return expected
      && row.source_sheet_name === expected.source_sheet
      && Number(row.record_count) === expected.items.length
      && row.source_rows_json === JSON.stringify(expected.source_rows);
  });
  const sheetItemCountsMatch = seed.sheets.every(
    (sheet) => (importedSheetCounts.get(sheet.source_sheet_index) || 0) === sheet.items.length
  );
  const categoryCountsMatch = Object.entries(expectedCategories).every(
    ([category, count]) => importedCategoryCounts[category] === count
  );
  if (importedAssets !== assets.length
    || importedSheets !== seed.sheets.length
    || !sheetContentMatches
    || !sheetItemCountsMatch
    || (editedRecords === 0 && !categoryCountsMatch)) {
    throw new Error(`Verifikasi impor gagal: ${JSON.stringify({
      importedAssets,
      importedSheets,
      importedCategoryCounts,
      editedRecords,
      sheetContentMatches,
      sheetItemCountsMatch,
    })}`);
  }
  if (existingProposals !== 80) {
    throw new Error(`Jumlah usulan Sarpras berubah atau tidak sesuai: ditemukan ${existingProposals}, seharusnya 80.`);
  }

  console.log(JSON.stringify({
    importedSheets,
    importedAssets,
    categoryCounts: importedCategoryCounts,
    editedRecords,
    originalCategoryCountsMatch: categoryCountsMatch,
    sheetContentMatches,
    sheetItemCountsMatch,
    sheetsWithoutAssets: seed.sheets.filter((sheet) => sheet.items.length === 0).length,
    existingProposals,
    ruangan: "POLIKLINIK",
    sourceFile,
  }));
} catch (error) {
  console.error("Migrasi inventaris KIR gagal:", error.message);
  process.exitCode = 1;
} finally {
  client.close();
}
