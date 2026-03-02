import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { format, addDays } from "date-fns";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  const hariIniObj = new Date();
  const besokObj = addDays(hariIniObj, 1);

  const tglSaja = hariIniObj.getDate();
  const blnSaja = hariIniObj.getMonth() + 1;
  const thnSaja = hariIniObj.getFullYear();

  const tglBesok = besokObj.getDate();
  const blnBesok = besokObj.getMonth() + 1;
  const thnBesok = besokObj.getFullYear();
  
  const blnFilter = parseInt(searchParams.get("bulan")) || blnSaja;
  const thnFilter = parseInt(searchParams.get("tahun")) || thnSaja;
  
  const formatHariIni = format(hariIniObj, "yyyy-MM-dd");
  const namaHariIndo = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][hariIniObj.getDay()];

  try {
    const sdmCount = await turso.execute("SELECT COUNT(*) as total FROM sdm");
    const dokterCount = await turso.execute("SELECT COUNT(DISTINCT nama_dokter) as total FROM master_dokter");

    // 1. Ambil Jadwal Dinas (Ambil 2 bulan sekaligus jika di akhir bulan agar asisten besok tetap muncul)
    const resJadwal = await turso.execute({
      sql: `SELECT j.*, s.nama, s.jabatan 
            FROM jadwal_dinas j 
            JOIN sdm s ON j.sdm_id = s.id 
            WHERE (j.bulan = ? AND j.tahun = ?) OR (j.bulan = ? AND j.tahun = ?)`,
      args: [blnFilter, thnFilter, blnBesok, thnBesok]
    });
    const semuaJadwal = resJadwal.rows;

    // 2. Ambil Data Cuti
    const sdmCuti = await turso.execute({
      sql: `SELECT * FROM cuti_sdm WHERE status_acc = 'Disetujui' AND (strftime('%m', tgl_mulai) = ? AND strftime('%Y', tgl_mulai) = ?)`,
      args: [String(blnFilter).padStart(2, '0'), String(thnFilter)]
    });

    const dokterCuti = await turso.execute({
      sql: `SELECT * FROM cuti_dokter WHERE ? BETWEEN tgl_mulai AND tgl_selesai`,
      args: [formatHariIni]
    });

    // 3. Ambil Master Dokter Praktik Hari Ini
    const resMasterDokter = await turso.execute({
      sql: "SELECT * FROM master_dokter WHERE jadwal_hari = ?",
      args: [namaHariIndo]
    });

    // 4. PROSES PENCARIAN ASISTEN (HARI INI & BESOK)
    const jadwalDokterLengkap = resMasterDokter.rows.map(dok => {
      // Cari asisten hari ini
      const asistenHariIni = semuaJadwal.find(p => 
        p.tanggal === tglSaja && p.bulan === blnSaja &&
        p.simbol.trim().toUpperCase() === dok.simbol_praktik.trim().toUpperCase()
      );

      // Cari asisten besok (Prediksi)
      const asistenBesok = semuaJadwal.find(p => 
        p.tanggal === tglBesok && p.bulan === blnBesok &&
        p.simbol.trim().toUpperCase() === dok.simbol_praktik.trim().toUpperCase()
      );

      return {
        ...dok,
        asisten: asistenHariIni ? asistenHariIni.nama : "---",
        jabatan_asisten: asistenHariIni ? asistenHariIni.jabatan : "",
        asistenBesok: asistenBesok ? asistenBesok.nama : "Belum Ada Jadwal",
        isCuti: dokterCuti.rows.some(c => c.nama_dokter === dok.nama_dokter)
      };
    });

    return NextResponse.json({
      summary: {
        totalSDM: sdmCount.rows[0]?.total || 0,
        totalDokter: dokterCount.rows[0]?.total || 0,
        perawatMasuk: semuaJadwal.filter(r => r.tanggal === tglSaja && r.bulan === blnSaja && !["L","CT","CS"].includes(r.simbol)).length,
        sdmIzinCount: sdmCuti.rows.length
      },
      perawatDinas: semuaJadwal.filter(j => j.bulan === blnFilter), // Kembalikan hanya bulan filter untuk tabel utama
      sdmCuti: sdmCuti.rows,
      dokterPraktik: jadwalDokterLengkap
    });

  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}