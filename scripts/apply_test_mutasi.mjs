import fs from 'fs';
try {
  const envPath = new URL('../.env', import.meta.url);
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    if (!line || line.trim().startsWith('#')) return;
    const i = line.indexOf('=');
    if (i <= 0) return;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  });
  console.log('.env loaded');
} catch (e) {
  console.warn('.env not loaded', e.message);
}

const mod = await import('../src/lib/turso.js');
const { turso } = mod;

const id = 22;
const status_kerja = 'ROTASI';
const ruangan_aktif = 'RADIOLOGI';
const keterangan = 'Simulasi ROTASI tengah bulan via script';
const jenis_mutasi = 'ROTASI';
const tanggal_mulai = '2026-09-03';
const tanggal_selesai = null;

(async function main(){
  try {
    const res = await turso.execute({ sql: 'SELECT * FROM sdm WHERE id = ?', args: [id] });
    if (!res.rows || res.rows.length === 0) {
      console.error('SDM not found', id);
      process.exit(1);
    }
    const old = res.rows[0];

    // insert history
    await turso.execute({
      sql: `INSERT INTO sdm_histori_mutasi (sdm_id, ruangan_lama, ruangan_baru, status_sebelum, status_sesudah, jenis_mutasi, tanggal_mulai, tanggal_selesai, keterangan, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      args: [id, old.ruangan_aktif || old.ruangan || null, ruangan_aktif || null, old.status_kerja || null, status_kerja || null, jenis_mutasi || status_kerja || null, tanggal_mulai || null, tanggal_selesai || null, keterangan || null, null]
    });

    // update sdm
    const now = new Date().toISOString().slice(0,10);
    const isAktif = (status_kerja && (status_kerja === 'RESIGN' || status_kerja === 'NON_AKTIF')) ? 0 : 1;
    await turso.execute({
      sql: `UPDATE sdm SET status_kerja = ?, ruangan_aktif = ?, is_aktif = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [status_kerja || old.status_kerja, ruangan_aktif || old.ruangan_aktif || old.ruangan, isAktif, id]
    });

    console.log('Mutasi applied to DB for id', id);
  } catch (e) {
    console.error('Error', e.message || e);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
