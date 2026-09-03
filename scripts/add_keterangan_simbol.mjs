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

try {
  await turso.execute({ sql: `ALTER TABLE master_dokter ADD COLUMN keterangan_simbol TEXT DEFAULT ''` });
  console.log('Column keterangan_simbol added (or already exists).');
} catch (e) {
  console.error('Error adding column (it might already exist):', e.message || e);
}

try {
  const pragma = await turso.execute({ sql: "PRAGMA table_info('master_dokter')" });
  console.log('master_dokter columns:\n', pragma.rows.map(r=>r.name+' ('+(r.dflt_value||'')+')').join('\n'));
} catch(e) {
  console.error('Error reading pragma', e.message || e);
}

process.exit(0);
