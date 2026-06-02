import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";

export const dynamic = "force-dynamic";

// KAMUS BOBOT TINDAKAN (Bisa Bapak sesuaikan nanti)
// 1.0 = Poli Standar (Asesmen)
// 1.5 = Poli dengan tindakan ringan
// 2.5 = Poli dengan tindakan berat (Bedah, Rawat Luka, dll)
const BOBOT_POLI = {
  "BEDAH UMUM": 2.5,
  "ORTOPEDI": 2.5,
  "GIGI": 2.0,
  "MATA": 1.5,
  "PENYAKIT DALAM": 1.0,
  "SARAF": 1.0,
  "ANAK": 1.0,
  "OBGYN": 1.5,
  // Tambahkan poli lain di sini. Jika tidak ada, defaultnya 1.0
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  // Parameter Default (Harian)
  const pTanggal = parseInt(searchParams.get("tanggal")) || new Date().getDate();
  const pBulan = parseInt(searchParams.get("bulan")) || (new Date().getMonth() + 1);
  const pTahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

  // Parameter Khusus Download Laporan (Rentang Waktu)
  const tglAwal = searchParams.get("tglAwal");   // Format YYYY-MM-DD
  const tglAkhir = searchParams.get("tglAkhir"); // Format YYYY-MM-DD

  // Tentukan apakah ini query Harian biasa atau query Rentang Waktu (Mode Laporan)
  const isModeLaporan = tglAwal && tglAkhir;

  let queryTglAwal, queryTglAkhir, formatTglTarget, namaHariIndo;

  if (isModeLaporan) {
    queryTglAwal = tglAwal;
    queryTglAkhir = tglAkhir;
  } else {
    // Jika Harian, rentang waktu disetel ke hari yang sama
    const targetDate = new Date(pTahun, pBulan - 1, pTanggal);
    formatTglTarget = format(targetDate, "yyyy-MM-dd");
    namaHariIndo = format(targetDate, "eeee", { locale: id });
    queryTglAwal = formatTglTarget;
    queryTglAkhir = formatTglTarget;
  }

  try {
    // 1. Ambil Summary Statis
    const sdmCount = await turso.execute("SELECT COUNT(*) as total FROM sdm");
    const dokterCount = await turso.execute("SELECT COUNT(DISTINCT nama_dokter) as total FROM master_dokter");

    // 2. Ambil Jadwal Perawat Berdasarkan Rentang Waktu
    const resJadwal = await turso.execute({
      sql: `SELECT j.*, s.nama 
            FROM jadwal_dinas j 
            JOIN sdm s ON j.sdm_id = s.id 
            WHERE date(printf('%04d-%02d-%02d', j.tahun, j.bulan, j.tanggal)) BETWEEN ? AND ?`,
      args: [queryTglAwal, queryTglAkhir]
    });
    const semuaJadwal = resJadwal.rows;

    // 3. AMBIL DATA PASIEN POLI Berdasarkan Rentang Waktu
    const resPasienPoli = await turso.execute({
      sql: `SELECT * FROM jumlah_pasien_poli 
            WHERE date(printf('%04d-%02d-%02d', tahun, bulan, tanggal)) BETWEEN ? AND ?`,
      args: [queryTglAwal, queryTglAkhir]
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

    // 5. Ambil Master Dokter (Semua jika Laporan, Spesifik hari jika Harian)
    let resMasterDokter;
    if (isModeLaporan) {
      resMasterDokter = await turso.execute("SELECT * FROM master_dokter");
    } else {
      resMasterDokter = await turso.execute({
        sql: "SELECT * FROM master_dokter WHERE jadwal_hari = ?",
        args: [namaHariIndo]
      });
    }

    /**
     * 6. PROSES MAPPING DATA KE KOTAK DOKTER (Termasuk Total Bulanan)
     */
    const dokterPraktik = resMasterDokter.rows.map(dok => {
      // Data Pasien Harian (hanya berlaku jika mode harian)
      const recordPasienHarian = !isModeLaporan ? dataPasienPoli.find(p => 
        p.nama_dokter === dok.nama_dokter && p.klinik === dok.klinik && p.tanggal === pTanggal
      ) : null;

      // Data Pasien Bulanan / Rentang Waktu (dijumlahkan)
      const listPasienRentang = dataPasienPoli.filter(p => p.nama_dokter === dok.nama_dokter && p.klinik === dok.klinik);
      const totalPasienRentang = listPasienRentang.reduce((sum, item) => sum + (item.jumlah || 0), 0);

      // Cari tim perawat harian (hanya untuk tampilan Harian)
      const timHarian = !isModeLaporan ? semuaJadwal.filter(j => 
        j.tanggal === pTanggal && j.simbol.trim().toUpperCase() === dok.simbol_praktik.trim().toUpperCase()
      ) : [];

      const isCuti = !isModeLaporan ? resDokterCuti.rows.some(c => 
        c.nama_dokter === dok.nama_dokter && formatTglTarget >= c.tgl_mulai && formatTglTarget <= c.tgl_selesai
      ) : false;

      return {
        ...dok,
        isCuti,
        jumlah_pasien_poli: recordPasienHarian ? recordPasienHarian.jumlah : 0, // Untuk input harian
        total_pasien_bulanan: totalPasienRentang, // Untuk label Kunjungan Bulan Ini / Rekap Word
        timAsisten: timHarian.map(t => ({ id: t.sdm_id, nama: t.nama }))
      };
    });

    /**
     * 7. PROSES HITUNG BEBAN KERJA (DENGAN SISTEM BOBOT TINDAKAN)
     */
    const perawatUnik = [...new Set(semuaJadwal.map(j => j.sdm_id))];
    const leaderboardBeban = perawatUnik.map(idSdm => {
      const infoSdm = semuaJadwal.find(j => j.sdm_id === idSdm);
      let totalBeban = 0;
      const daftarPoliDibantu = new Set(); // Menggunakan Set agar tidak duplikat

      // Ambil semua riwayat jadwal perawat ini dalam rentang waktu tersebut
      const riwayatJadwalSdm = semuaJadwal.filter(j => j.sdm_id === idSdm);

      riwayatJadwalSdm.forEach(jadwal => {
        // Cari poli apa yang dilambangkan oleh simbol jadwal ini
        const poliTerkait = resMasterDokter.rows.find(md => md.simbol_praktik.trim().toUpperCase() === jadwal.simbol.trim().toUpperCase());
        
        if (poliTerkait) {
          // Tambahkan ke daftar unit kerja yang pernah dibantu
          daftarPoliDibantu.add(`${poliTerkait.klinik}`);

          // Cari data kunjungan pasien pada TANGGAL SPESIFIK tersebut
          const kunjunganHariItu = dataPasienPoli.find(p => 
            p.nama_dokter === poliTerkait.nama_dokter && p.klinik === poliTerkait.klinik &&
            p.tanggal === jadwal.tanggal && p.bulan === jadwal.bulan && p.tahun === jadwal.tahun
          );

          if (kunjunganHariItu && kunjunganHariItu.jumlah > 0) {
            // Cek berapa asisten yang bertugas di poli itu pada hari itu
            const jumlahAsistenHariItu = semuaJadwal.filter(j => 
              j.simbol === jadwal.simbol && j.tanggal === jadwal.tanggal && j.bulan === jadwal.bulan && j.tahun === jadwal.tahun
            ).length || 1;

            // Hitung beban mentah: (Kunjungan / Jumlah Asisten)
            const bebanMentah = kunjunganHariItu.jumlah / jumlahAsistenHariItu;

            // TERAPKAN BOBOT! (Default 1.0 jika klinik tidak terdaftar di BOBOT_POLI)
            const bobot = BOBOT_POLI[poliTerkait.klinik.toUpperCase()] || 1.0;
            const bebanTertimbang = Math.round(bebanMentah * bobot);

            totalBeban += bebanTertimbang;
          }
        }
      });

      return {
        id: idSdm,
        nama: infoSdm.nama,
        total_pasien: totalBeban,
        detail_poli: Array.from(daftarPoliDibantu).join(", ")
      };
    }).filter(p => p.nama !== 'ADMIN');

    // Urutkan Leaderboard dari yang terberat
    leaderboardBeban.sort((a, b) => b.total_pasien - a.total_pasien);

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
        perawatMasuk: !isModeLaporan ? semuaJadwal.length : perawatUnik.length,
        sdmIzinCount: resSdmCuti.rows.length,
        tanggal_hari_ini: pTanggal,
        isLaporan: isModeLaporan 
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