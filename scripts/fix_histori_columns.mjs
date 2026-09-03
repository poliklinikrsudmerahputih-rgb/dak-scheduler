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

try {
  const mod = await import('../src/lib/turso.js');
  const { turso } = mod;

  const desired = [
    { name: 'sdm_id', type: 'INTEGER' },
    { name: 'ruangan_lama', type: 'TEXT' },
    { name: 'ruangan_baru', type: 'TEXT' },
    { name: 'status_sebelum', type: 'TEXT' },
    { name: 'status_sesudah', type: 'TEXT' },
    { name: 'jenis_mutasi', type: 'TEXT' },
    { name: 'tanggal_mulai', type: 'TEXT' },
    { name: 'tanggal_selesai', type: 'TEXT' },
    { name: 'keterangan', type: 'TEXT' },
    { name: 'created_by', type: 'INTEGER' },
    { name: 'created_at', type: 'TEXT' }
  ];

  const res = await turso.execute({ sql: "PRAGMA table_info('sdm_histori_mutasi')" });
  const existing = res.rows.map(r => r.name);
  console.log('Existing columns:', existing.join(', '));

  for (const col of desired) {
    if (!existing.includes(col.name)) {
      try {
        await turso.execute({ sql: `ALTER TABLE sdm_histori_mutasi ADD COLUMN ${col.name} ${col.type}` });
        console.log('Added column', col.name);
      } catch (e) {
        console.error('Failed to add', col.name, e.message || e);
      }
    } else {
      console.log('Already has', col.name);
    }
  }

  const after = await turso.execute({ sql: "PRAGMA table_info('sdm_histori_mutasi')" });
  console.log('After columns:', after.rows.map(r => r.name).join(', '));
} catch (err) {
  console.error('ERROR', err.message || err);
  process.exit(1);
}
process.exit(0);
