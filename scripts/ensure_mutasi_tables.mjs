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

  const stmts = [
    `CREATE TABLE IF NOT EXISTS sdm_histori_mutasi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sdm_id INTEGER NOT NULL,
      ruangan_lama TEXT,
      ruangan_baru TEXT,
      status_sebelum TEXT,
      status_sesudah TEXT,
      jenis_mutasi TEXT,
      tanggal_mulai TEXT,
      tanggal_selesai TEXT,
      keterangan TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sdm_id) REFERENCES sdm(id)
    );`,

    `CREATE TABLE IF NOT EXISTS log_aktivitas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      ruangan TEXT,
      old_value TEXT,
      new_value TEXT,
      keterangan TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`
  ];

  for (const sql of stmts) {
    try {
      await turso.execute({ sql });
      console.log('OK:', sql.split('\n')[0]);
    } catch (e) {
      console.error('ERR executing:', e.message || e);
    }
  }

  const tables = await turso.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" });
  console.log('Tables in DB:', tables.rows.map(r => r.name).join(', '));
} catch (err) {
  console.error('ERROR', err.message || err);
  process.exit(1);
}
process.exit(0);
