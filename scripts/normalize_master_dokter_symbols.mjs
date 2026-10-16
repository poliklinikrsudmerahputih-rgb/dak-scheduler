import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN harus di-set terlebih dahulu.');
  process.exit(1);
}

const turso = createClient({ url, authToken });

async function normalizeDoctorSymbols() {
  const rows = await turso.execute({
    sql: 'SELECT id, simbol_praktik FROM master_dokter WHERE simbol_praktik IS NOT NULL',
    args: [],
  });

  let updated = 0;
  for (const row of rows.rows || []) {
    const id = row.id;
    const raw = String(row.simbol_praktik ?? '').trim();
    const normalized = raw.toUpperCase();

    if (!raw || raw === normalized) continue;

    await turso.execute({
      sql: 'UPDATE master_dokter SET simbol_praktik = ? WHERE id = ?',
      args: [normalized, id],
    });

    updated += 1;
  }

  console.log(`Selesai. Diperbarui ${updated} simbol dokter menjadi uppercase.`);
}

normalizeDoctorSymbols().catch((error) => {
  console.error('Gagal normalisasi simbol dokter:', error);
  process.exit(1);
});
