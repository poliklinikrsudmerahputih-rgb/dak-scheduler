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
  console.log('Adding column created_at if missing...');
  try {
    await turso.execute({ sql: "ALTER TABLE sdm ADD COLUMN created_at TEXT" });
    console.log('ALTER TABLE created_at OK');
  } catch (e) {
    console.warn('ALTER TABLE created_at warning:', e.message || e);
  }

  try {
    await turso.execute({ sql: "UPDATE sdm SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR TRIM(created_at) = ''" });
    console.log('UPDATE created_at OK');
  } catch (e) {
    console.error('UPDATE created_at error:', e.message || e);
  }

  const res = await turso.execute({ sql: "PRAGMA table_info('sdm')" });
  console.log('PRAGMA AFTER:');
  console.log(JSON.stringify(res.rows, null, 2));
} catch (err) {
  console.error('ERROR', err.message || err);
  process.exit(1);
}
process.exit(0);
