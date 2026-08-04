import fs from 'fs';
try {
  const content = fs.readFileSync('./.env', 'utf8');
  content.split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([^=]+)=(.*)$/);
    if (m) {
      const k = m[1].trim();
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1);
      process.env[k] = v;
    }
  });
} catch (e) {}

import { createClient } from '@libsql/client';
(async () => {
  try {
    console.log('ENV TURSO_DATABASE_URL:', process.env.TURSO_DATABASE_URL ? '[ok]' : 'MISSING');
    const turso = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
    const d = new Date();
    const tanggal = String(d.getDate());
    const bulan = String(d.getMonth()+1);
    const tahun = String(d.getFullYear());
    console.log('Inspecting jumlah_pasien_poli for', tanggal, bulan, tahun);
    const res = await turso.execute({ sql: 'SELECT * FROM jumlah_pasien_poli WHERE tanggal = ? AND bulan = ? AND tahun = ?', args: [tanggal, bulan, tahun] });
    console.log('rows:', res.rows.length);
    console.dir(res.rows, { depth: 4 });
      const masters = await turso.execute({ sql: "SELECT id, nama_dokter, klinik FROM master_dokter WHERE nama_dokter LIKE '%Danu%' OR nama_dokter LIKE '%Dadang%' OR nama_dokter LIKE '%Dandy%'", args: [] });
      console.log('master matches:', masters.rows.length);
      console.dir(masters.rows, { depth: 4 });
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
