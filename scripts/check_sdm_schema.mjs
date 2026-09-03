import fs from 'fs';

// Load .env if present (safe parser)
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
  console.warn('.env not found or could not be read', e.message);
}

try {
  const mod = await import('../src/lib/turso.js');
  const { turso } = mod;
  const res = await turso.execute({ sql: "PRAGMA table_info('sdm')" });
  console.log('PRAGMA result:');
  console.log(JSON.stringify(res.rows, null, 2));
} catch (err) {
  console.error('TURSO_CHECK_ERROR', err.message || err);
  process.exit(1);
}

process.exit(0);
