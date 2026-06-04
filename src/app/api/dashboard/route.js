import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";

export const dynamic = "force-dynamic";

// KAMUS BOBOT TINDAKAN (Acuity-Based Metric)
// 1.0 = Poli Standar / Asesmen
// 1.5 = Poli dengan tindakan ringan / sedang
// 2.5 = Poli dengan tindakan berat (Bedah, Rawat Luka, Gips)
const BOBOT_POLI = {
  "BEDAH UMUM": 2.5,
  "ORTOPEDI": 2.5,
  "GIGI": 2.0,
  "MATA": 1.5,
  "PENYAKIT DALAM": 1.0,
  "SARAF": 1.0,
  "ANAK": 1.0,
  "OBGYN": 1.5,
  "UMUM": 1.0,
  "KLINIK NYERI": 1.5
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
     * KUNCI FIX PERBAIKAN: FUNGSI NAVIGASI SIMBOL/GRUP
     * Berfungsi memetakan teks input jadwal dinas (Cth: 'UMUM', 'ORTO') 
     * ke Simbol Stasiun Utama (Cth: '3' atau '4') secara real-time
     */
    const getSimbolGrup = (jadwalSimbol) => {
      if (!jadwalSimbol) return "LAINNYA";
      let jSimbol = jadwalSimbol.trim().toUpperCase();
      let docMatch = resMasterDokter.rows.find(md => 
        md.klinik.trim().toUpperCase() === jSimbol || 
        md.simbol_praktik.trim().toUpperCase() === jSimbol
      );
      return docMatch ? docMatch.simbol_praktik.trim().toUpperCase() : jSimbol;
    };

    /**
     * 6. PROSES MAPPING DATA KE KOTAK DOKTER (Termasuk Total Bulanan)
     */
    const dokterPraktik = resMasterDokter.rows.map(dok => {
      // Data Pasien Harian
      const recordPasienHarian = !isModeLaporan ? dataPasienPoli.find(p => 
        p.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
        p.klinik.trim().toUpperCase() === dok.klinik.trim().toUpperCase() && 
        p.tanggal === pTanggal
      ) : null;

      // Data Pasien Bulanan / Rentang Waktu (dijumlahkan)
      const listPasienRentang = dataPasienPoli.filter(p => 
        p.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
        p.klinik.trim().toUpperCase() === dok.klinik.trim().toUpperCase()
      );
      const totalPasienRentang = listPasienRentang.reduce((sum, item) => sum + (item.jumlah || 0), 0);

      // Cari tim perawat harian berdasarkan Stasiun Grup hasil resolve
      const timHarian = !isModeLaporan ? semuaJadwal.filter(j => 
        j.tanggal === pTanggal && getSimbolGrup(j.simbol) === dok.simbol_praktik.trim().toUpperCase()
      ) : [];

      const isCuti = !isModeLaporan ? resDokterCuti.rows.some(c => 
        c.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
        formatTglTarget >= c.tgl_mulai && formatTglTarget <= c.tgl_selesai
      ) : false;

      return {
        ...dok,
        isCuti,
        jumlah_pasien_poli: recordPasienHarian ? recordPasienHarian.jumlah : 0, 
        total_pasien_bulanan: totalPasienRentang, 
        timAsisten: timHarian.map(t => ({ id: t.sdm_id, nama: t.nama }))
      };
    });

    /**
     * 7. FIX LOGIKA TOTAL POOLING BEBAN KERJA (DENGAN SISTEM BAGI RATA TIM GRUP)
     * Menghitung akumulasi total seluruh dokter di Ners yang sama, lalu membaginya rata.
     */
    const perawatUnik = [...new Set(semuaJadwal.map(j => j.sdm_id))];
    const leaderboardBeban = perawatUnik.map(idSdm => {
      const infoSdm = semuaJadwal.find(j => j.sdm_id === idSdm);
      let totalBeban = 0;
      const daftarPoliDibantu = new Set(); 

      const riwayatJadwalSdm = semuaJadwal.filter(j => j.sdm_id === idSdm);

      riwayatJadwalSdm.forEach(jadwal => {
        // Cari stasiun induk perawat ini (Ners 3, Ners 4, dll)
        const targetSimbolGroup = getSimbolGrup(jadwal.simbol);

        // Cari seluruh dokter yang bernaung di bawah stasiun induk tersebut
        const daftarDokterSatuSimbol = resMasterDokter.rows.filter(md => 
          md.simbol_praktik.trim().toUpperCase() === targetSimbolGroup
        );
        
        if (daftarDokterSatuSimbol.length > 0) {
          let totalSkorStasiunHariIni = 0;

          daftarDokterSatuSimbol.forEach(dok => {
            daftarPoliDibantu.add(dok.klinik.trim().toUpperCase());

            // Ambil data kunjungan pasien dokter tersebut pada hari spesifik jadwal dinas
            const kunjunganHariItu = dataPasienPoli.find(p => 
              p.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
              p.klinik.trim().toUpperCase() === dok.klinik.trim().toUpperCase() &&
              p.tanggal === jadwal.tanggal && 
              p.bulan === jadwal.bulan && 
              p.tahun === jadwal.tahun
            );

            if (kunjunganHariItu && kunjunganHariItu.jumlah > 0) {
              const bobot = BOBOT_POLI[dok.klinik.trim().toUpperCase()] || 1.0;
              totalSkorStasiunHariIni += (kunjunganHariItu.jumlah * bobot);
            }
          });

          // Hitung total alokasi asisten yang menjaga stasiun ini di hari yang sama
          const jumlahAsistenHariItu = semuaJadwal.filter(j => 
            getSimbolGrup(j.simbol) === targetSimbolGroup && 
            j.tanggal === jadwal.tanggal && 
            j.bulan === jadwal.bulan && 
            j.tahun === jadwal.tahun
          ).length || 1;

          // Akumulasi beban tertimbang yang dibagi rata untuk satu perawat
          totalBeban += Math.round(totalSkorStasiunHariIni / jumlahAsistenHariItu);
        } else {
          // Jika tidak ada master dokter yang cocok, gunakan data simbol asli sebagai cadangan info
          daftarPoliDibantu.add(jadwal.simbol.trim().toUpperCase());
        }
      });

      return {
        id: idSdm,
        nama: infoSdm.nama,
        total_pasien: totalBeban,
        detail_poli: Array.from(daftarPoliDibantu).join(", ")
      };
    }).filter(p => p.nama !== 'ADMIN');

    // Urutkan Leaderboard dari yang tertinggi
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