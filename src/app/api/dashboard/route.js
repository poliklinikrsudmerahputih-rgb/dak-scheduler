import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { format } from "date-fns";
import { id } from "date-fns/locale";

// Memaksa data selalu fresh agar inputan langsung muncul
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  const pTanggal = parseInt(searchParams.get("tanggal")) || new Date().getDate();
  const pBulan = parseInt(searchParams.get("bulan")) || (new Date().getMonth() + 1);
  const pTahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

  const targetDate = new Date(pTahun, pBulan - 1, pTanggal);
  const formatTglTarget = format(targetDate, "yyyy-MM-dd");
  const namaHariIndo = format(targetDate, "eeee", { locale: id });

  try {
    // 1. Ambil Summary Statis
    const sdmCount = await turso.execute("SELECT COUNT(*) as total FROM sdm");
    const dokterCount = await turso.execute("SELECT COUNT(DISTINCT nama_dokter) as total FROM master_dokter");

    // 2. Ambil Jadwal Perawat (Siapa bantu Simbol apa)
    const resJadwal = await turso.execute({
      sql: `SELECT j.*, s.nama 
            FROM jadwal_dinas j 
            JOIN sdm s ON j.sdm_id = s.id 
            WHERE j.tanggal = ? AND j.bulan = ? AND j.tahun = ?`,
      args: [pTanggal, pBulan, pTahun]
    });
    const semuaJadwal = resJadwal.rows;

    // 3. AMBIL DATA DARI TABEL BARU (Data Pasien Spesifik Poli)
    const resPasienPoli = await turso.execute({
      sql: `SELECT * FROM jumlah_pasien_poli 
            WHERE tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [pTanggal, pBulan, pTahun]
    });
    const dataPasienPoli = resPasienPoli.rows;

    // 4. Ambil Data Cuti SDM & Dokter
    const [resSdmCuti, resDokterCuti] = await Promise.all([
      turso.execute({
        sql: `SELECT * FROM cuti_sdm 
              WHERE (strftime('%m', tgl_mulai) = ? OR strftime('%m', tgl_selesai) = ?)
              ORDER BY id DESC LIMIT 20`,
        args: [String(pBulan).padStart(2, '0'), String(pBulan).padStart(2, '0')]
      }),
      turso.execute({
        sql: "SELECT * FROM cuti_dokter WHERE (strftime('%m', tgl_mulai) = ? OR strftime('%m', tgl_selesai) = ?)",
        args: [String(pBulan).padStart(2, '0'), String(pBulan).padStart(2, '0')]
      })
    ]);

    // 5. Ambil Master Dokter yang praktik hari ini
    const resMasterDokter = await turso.execute({
      sql: "SELECT * FROM master_dokter WHERE jadwal_hari = ?",
      args: [namaHariIndo]
    });

    /**
     * 6. PROSES MAPPING DATA KE KOTAK DOKTER
     */
    const dokterPraktik = resMasterDokter.rows.map(dok => {
      // Cari data pasien spesifik poli ini di tabel baru
      const recordPasien = dataPasienPoli.find(p => 
        p.nama_dokter === dok.nama_dokter && p.klinik === dok.klinik
      );

      // Cari tim perawat berdasarkan simbol
      const tim = semuaJadwal.filter(j => 
        j.simbol.trim().toUpperCase() === dok.simbol_praktik.trim().toUpperCase()
      );

      const isCuti = resDokterCuti.rows.some(c => 
        c.nama_dokter === dok.nama_dokter && 
        formatTglTarget >= c.tgl_mulai && 
        formatTglTarget <= c.tgl_selesai
      );

      return {
        ...dok,
        isCuti,
        jumlah_pasien_poli: recordPasien ? recordPasien.jumlah : 0,
        timAsisten: tim.map(t => ({
          id: t.sdm_id,
          nama: t.nama
        }))
      };
    });

    /**
     * 7. PROSES HITUNG BEBAN KERJA UNTUK LEADERBOARD
     * MODIFIKASI: Menambahkan 'id' agar fitur Swap bisa berjalan
     */
    const perawatUnik = [...new Set(semuaJadwal.map(j => j.sdm_id))];
    const leaderboardBeban = perawatUnik.map(idSdm => {
      const infoSdm = semuaJadwal.find(j => j.sdm_id === idSdm);
      
      let totalBeban = 0;
      const daftarPoliDibantu = [];

      dokterPraktik.forEach(dp => {
        if (dp.timAsisten.some(as => as.id === idSdm)) {
          const bebanPoli = Math.round(dp.jumlah_pasien_poli / dp.timAsisten.length);
          totalBeban += bebanPoli;
          daftarPoliDibantu.push(`${dp.klinik} (${dp.nama_dokter})`);
        }
      });

      return {
        id: idSdm, // <--- KUNCI UTAMA UNTUK FITUR TUKAR ASISTEN
        nama: infoSdm.nama,
        total_pasien: totalBeban,
        detail_poli: daftarPoliDibantu.join(", ")
      };
    }).filter(p => p.nama !== 'ADMIN');

    // 8. Format Izin SDM
    const dataCutiSdmMapped = resSdmCuti.rows.map(s => ({
      nama_sdm: s.nama_sdm,
      jenis_cuti: s.jenis_cuti,
      status_acc: s.status_acc || "Menunggu",
      tgl_mulai: format(new Date(s.tgl_mulai), "dd MMM"),
      tgl_selesai: format(new Date(s.tgl_selesai), "dd MMM")
    }));

    return NextResponse.json({
      summary: {
        totalSDM: sdmCount.rows[0]?.total || 0,
        totalDokter: dokterCount.rows[0]?.total || 0,
        perawatMasuk: semuaJadwal.length,
        sdmIzinCount: resSdmCuti.rows.length,
        tanggal_hari_ini: pTanggal 
      },
      sdmCuti: dataCutiSdmMapped,
      dokterPraktik: dokterPraktik,
      leaderboard: leaderboardBeban
    });

  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}