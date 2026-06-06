import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 1. ISOLASI KEAMANAN (RLS) YANG FLEKSIBEL UNTUK SHARE LINK
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    
    // SET DEFAULT AGAR SHARE LINK TIDAK KOSONG
    let userRuangan = "POLIKLINIK"; 
    const paramRuangan = searchParams.get("ruangan");

    if (session) {
      // Jika sedang login, gunakan ruangan milik Karu tersebut
      try {
        const userData = JSON.parse(session.value);
        userRuangan = userData.ruangan || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama terdeteksi");
      }
    } else if (paramRuangan) {
      // Jika tidak login, tapi URL memuat parameter ruangan, gunakan parameter itu
      userRuangan = paramRuangan;
    }
    // CATATAN: Blok penolakan akses (401) sudah dihapus di sini
    // Jika tidak login dan tidak ada parameter, sistem akan aman menampilkan "POLIKLINIK"

    const kunciRuangan = userRuangan.toUpperCase();

    // Parameter Default (Harian)
    const pTanggal = parseInt(searchParams.get("tanggal")) || new Date().getDate();
    const pBulan = parseInt(searchParams.get("bulan")) || (new Date().getMonth() + 1);
    const pTahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

    // Parameter Khusus Download Laporan
    const tglAwal = searchParams.get("tglAwal"); 
    const tglAkhir = searchParams.get("tglAkhir"); 
    const isModeLaporan = tglAwal && tglAkhir;

    let queryTglAwal, queryTglAkhir, formatTglTarget, namaHariIndo;

    if (isModeLaporan) {
      queryTglAwal = tglAwal;
      queryTglAkhir = tglAkhir;
    } else {
      const targetDate = new Date(pTahun, pBulan - 1, pTanggal);
      formatTglTarget = format(targetDate, "yyyy-MM-dd");
      namaHariIndo = format(targetDate, "eeee", { locale: id });
      queryTglAwal = formatTglTarget;
      queryTglAkhir = formatTglTarget;
    }

    // 2. Ambil Summary Statis (Terkunci per Ruangan)
    const sdmCount = await turso.execute({
      sql: "SELECT COUNT(*) as total FROM sdm WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [kunciRuangan]
    });
    const dokterCount = await turso.execute({
      sql: "SELECT COUNT(DISTINCT nama_dokter) as total FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [kunciRuangan]
    });

    // 3. Ambil Jadwal Perawat (Terkunci per Ruangan)
    const resJadwal = await turso.execute({
      sql: `SELECT j.*, s.nama 
            FROM jadwal_dinas j 
            JOIN sdm s ON j.sdm_id = s.id 
            WHERE UPPER(TRIM(j.ruangan)) = UPPER(TRIM(?))
            AND date(printf('%04d-%02d-%02d', j.tahun, j.bulan, j.tanggal)) BETWEEN ? AND ?`,
      args: [kunciRuangan, queryTglAwal, queryTglAkhir]
    });
    const semuaJadwal = resJadwal.rows;

    // 4. Ambil Data Pasien Poli
    const resPasienPoli = await turso.execute({
      sql: `SELECT * FROM jumlah_pasien_poli 
            WHERE date(printf('%04d-%02d-%02d', tahun, bulan, tanggal)) BETWEEN ? AND ?`,
      args: [queryTglAwal, queryTglAkhir]
    });
    const dataPasienPoli = resPasienPoli.rows;

    // 5. Ambil Data Cuti SDM & Dokter (Terkunci per Ruangan)
    const [resSdmCuti, resDokterCuti] = await Promise.all([
      turso.execute({
        sql: `SELECT * FROM cuti_sdm 
              WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              AND (strftime('%m', tgl_mulai) = ? OR strftime('%m', tgl_selesai) = ?)
              ORDER BY id DESC LIMIT 20`,
        args: [kunciRuangan, String(pBulan).padStart(2, '0'), String(pBulan).padStart(2, '0')]
      }),
      turso.execute({
        sql: `SELECT * FROM cuti_dokter 
              WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              AND (strftime('%m', tgl_mulai) = ? OR strftime('%m', tgl_selesai) = ?)`,
        args: [kunciRuangan, String(pBulan).padStart(2, '0'), String(pBulan).padStart(2, '0')]
      })
    ]);

    // 6. Ambil Master Dokter (Terkunci per Ruangan)
    let resMasterDokter;
    if (isModeLaporan) {
      resMasterDokter = await turso.execute({
        sql: "SELECT * FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
        args: [kunciRuangan]
      });
    } else {
      resMasterDokter = await turso.execute({
        sql: "SELECT * FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?)) AND jadwal_hari = ?",
        args: [kunciRuangan, namaHariIndo]
      });
    }

    const getSimbolGrup = (jadwalSimbol) => {
      if (!jadwalSimbol) return "LAINNYA";
      let jSimbol = jadwalSimbol.trim().toUpperCase();
      let docMatch = resMasterDokter.rows.find(md => 
        md.klinik.trim().toUpperCase() === jSimbol || 
        md.simbol_praktik.trim().toUpperCase() === jSimbol
      );
      return docMatch ? docMatch.simbol_praktik.trim().toUpperCase() : jSimbol;
    };

    const dokterPraktik = resMasterDokter.rows.map(dok => {
      const recordPasienHarian = !isModeLaporan ? dataPasienPoli.find(p => 
        p.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
        p.klinik.trim().toUpperCase() === dok.klinik.trim().toUpperCase() && 
        p.tanggal === pTanggal
      ) : null;

      const listPasienRentang = dataPasienPoli.filter(p => 
        p.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
        p.klinik.trim().toUpperCase() === dok.klinik.trim().toUpperCase()
      );
      const totalPasienRentang = listPasienRentang.reduce((sum, item) => sum + (item.jumlah || 0), 0);

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
     * FIX LOGIKA RISET: Perhitungan Murni Angka Pasien (Tanpa Bobot)
     */
    const perawatUnik = [...new Set(semuaJadwal.map(j => j.sdm_id))];
    const leaderboardBeban = perawatUnik.map(idSdm => {
      const infoSdm = semuaJadwal.find(j => j.sdm_id === idSdm);
      let totalBeban = 0;
      const daftarPoliDibantu = new Set(); 

      const riwayatJadwalSdm = semuaJadwal.filter(j => j.sdm_id === idSdm);

      riwayatJadwalSdm.forEach(jadwal => {
        const targetSimbolGroup = getSimbolGrup(jadwal.simbol);

        const daftarDokterSatuSimbol = resMasterDokter.rows.filter(md => 
          md.simbol_praktik.trim().toUpperCase() === targetSimbolGroup
        );
        
        if (daftarDokterSatuSimbol.length > 0) {
          let totalPasienMurniStasiunHariIni = 0;

          daftarDokterSatuSimbol.forEach(dok => {
            daftarPoliDibantu.add(dok.klinik.trim().toUpperCase());

            const kunjunganHariItu = dataPasienPoli.find(p => 
              p.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
              p.klinik.trim().toUpperCase() === dok.klinik.trim().toUpperCase() &&
              p.tanggal === jadwal.tanggal && 
              p.bulan === jadwal.bulan && 
              p.tahun === jadwal.tahun
            );

            if (kunjunganHariItu && kunjunganHariItu.jumlah > 0) {
              totalPasienMurniStasiunHariIni += kunjunganHariItu.jumlah; 
            }
          });

          const jumlahAsistenHariItu = semuaJadwal.filter(j => 
            getSimbolGrup(j.simbol) === targetSimbolGroup && 
            j.tanggal === jadwal.tanggal && 
            j.bulan === jadwal.bulan && 
            j.tahun === jadwal.tahun
          ).length || 1;

          totalBeban += Math.round(totalPasienMurniStasiunHariIni / jumlahAsistenHariItu);
        } else {
          // Fallback aman untuk jadwal.simbol yang berpotensi null/undefined
          const simbolAman = jadwal.simbol ? jadwal.simbol.trim().toUpperCase() : "TIDAK DIKETAHUI";
          daftarPoliDibantu.add(simbolAman);
        }
      });

      return {
        id: idSdm,
        nama: infoSdm.nama,
        total_pasien: totalBeban,
        detail_poli: Array.from(daftarPoliDibantu).join(", ")
      };
    }).filter(p => p.nama !== 'ADMIN');

    leaderboardBeban.sort((a, b) => b.total_pasien - a.total_pasien);

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