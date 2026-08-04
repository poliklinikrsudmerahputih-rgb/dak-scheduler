import fs from 'fs';
import { createClient } from '@libsql/client';
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

const normalizeKey = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();

(async () => {
  const turso = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  const d = new Date();
  const tanggal = String(d.getDate());
  const bulan = String(d.getMonth()+1);
  const tahun = String(d.getFullYear());
  console.log('Cleaning duplicates for', tanggal, bulan, tahun);

  const res = await turso.execute({ sql: 'SELECT * FROM jumlah_pasien_poli WHERE tanggal = ? AND bulan = ? AND tahun = ?', args: [tanggal, bulan, tahun] });
  const rows = res.rows;
  console.log('Found', rows.length, 'rows');

  const groups = {};
  rows.forEach(r => {
    const key = `${normalizeKey(r.nama_dokter)}|${normalizeKey(r.klinik)}|${String(r.tanggal)}|${String(r.bulan)}|${String(r.tahun)}`;
    groups[key] = groups[key] || [];
    groups[key].push(r);
  });

  let deleted = 0;
  for (const k of Object.keys(groups)) {
    const list = groups[k];
    if (list.length <= 1) continue;
    list.sort((a,b) => b.id - a.id); // newest first by id
    const keeper = list[0];
    // Optionally, consolidate jumlah: prefer keeper.jumlah if >0 else sum
    const sum = list.reduce((s,it) => s + (Number(it.jumlah)||0),0);
    const finalJumlah = Number(keeper.jumlah) > 0 ? Number(keeper.jumlah) : sum;

    // Update keeper to normalized name/klinik and finalJumlah
    await turso.execute({ sql: 'UPDATE jumlah_pasien_poli SET nama_dokter = ?, klinik = ?, jumlah = ? WHERE id = ?', args: [keeper.nama_dokter.replace(/\s+/g,' ').trim(), keeper.klinik.replace(/\s+/g,' ').trim(), finalJumlah, keeper.id] });

    // Delete other rows
    const toDelete = list.slice(1);
    for (const del of toDelete) {
      await turso.execute({ sql: 'DELETE FROM jumlah_pasien_poli WHERE id = ?', args: [del.id] });
      deleted += 1;
      console.log('Deleted duplicate id', del.id, 'for key', k);
    }
  }

  console.log('Cleanup complete. Deleted', deleted, 'rows.');
  const after = await turso.execute({ sql: 'SELECT * FROM jumlah_pasien_poli WHERE tanggal = ? AND bulan = ? AND tahun = ?', args: [tanggal, bulan, tahun] });
  console.log('Remaining rows:', after.rows.length);
  console.dir(after.rows, { depth: 4 });
})();
