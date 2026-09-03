import fs from 'fs';

// Load .env
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

const path = './scripts/migrations/add_sdm_migrations.sql';
if (!fs.existsSync(path)) {
  console.error('Migration file not found:', path);
  process.exit(1);
}

const content = fs.readFileSync(path, 'utf8');
// Split by semicolon followed by linebreak to avoid stray semicolons
const parts = content.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);

try {
  const mod = await import('../src/lib/turso.js');
  const { turso } = mod;
  for (const stmt of parts) {
    if (!stmt) continue;
    console.log('Executing statement:', stmt.split('\n')[0].slice(0,200));
    try {
      await turso.execute({ sql: stmt });
      console.log('OK');
    } catch (err) {
      console.error('ERROR executing statement:', err.message || err);
    }
  }
  console.log('Migration script complete.');
} catch (err) {
  console.error('TURSO_MIGRATION_ERROR', err.message || err);
  process.exit(1);
}

process.exit(0);
