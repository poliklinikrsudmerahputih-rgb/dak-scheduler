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
    
    let userRuangan = "POLIKLINIK"; 
    const paramRuangan = searchParams.get("ruangan");

    if (session) {
      try {
        const userData = JSON.parse(session.value);
        userRuangan = userData.ruangan || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama terdeteksi");
      }
    } else if (paramRuangan) {
      userRuangan = paramRuangan;
    }

    const kunciRuangan = String(userRuangan).trim().toUpperCase();

    // Parameter Default (Harian) dipastikan berformat Angka
    const pTanggal = Number(searchParams.get("tanggal")) || new Date().getDate();
    const pBulan = Number(searchParams.get("bulan")) || (new Date().getMonth() + 1);
    const pTahun = Number(searchParams.get("tahun")) || new Date().getFullYear();

    const tglAwal = searchParams.get("tglAwal"); 
    const tglAkhir = searchParams.get("tglAkhir"); 
    const isModeLaporan = tglAwal && tglAkhir;

    let queryTglAwalBulan, queryTglAkhirBulan, formatTglTarget, namaHariIndo;

    const targetDate = new Date(pTahun, pBulan - 1, pTanggal);
    formatTglTarget = format(targetDate, "yyyy-MM-dd");
    namaHariIndo = format(targetDate, "eeee", { locale: id });

    if (isModeLaporan) {
      queryTglAwalBulan = tglAwal;
      queryTglAkhirBulan = tglAkhir;
    } else {
      queryTglAwalBulan = format(new Date(pTahun, pBulan - 1, 1), "yyyy-MM-dd");
      queryTglAkhirBulan = format(new Date(pTahun, pBulan, 0), "yyyy-MM-dd");
    }

    // 2. Ambil Summary Statis
    const sdmCount = await turso.execute({
      sql: "SELECT COUNT(*) as total FROM sdm WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [kunciRuangan]
    });
    const dokterCount = await turso.execute({
      sql: "SELECT COUNT(DISTINCT nama_dokter) as total FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [kunciRuangan]
    });

    // 3. Ambil Jadwal Perawat (DITARIK SEBULAN PENUH)
    // PERBAIKAN: Gunakan CAST integer yang konsisten daripada date(printf) untuk hindari bug SQLite 09 vs 9
    let sqlJadwal = "";
    let argsJadwal = [];
    if (isModeLaporan) {
        sqlJadwal = `SELECT j.*, s.nama FROM jadwal_dinas j JOIN sdm s ON j.sdm_id = s.id WHERE UPPER(TRIM(j.ruangan)) = UPPER(TRIM(?)) AND date(substr('0000' || j.tahun, -4, 4) || '-' || substr('00' || j.bulan, -2, 2) || '-' || substr('00' || j.tanggal, -2, 2)) BETWEEN ? AND ?`;
        argsJadwal = [kunciRuangan, queryTglAwalBulan, queryTglAkhirBulan];
    } else {
        sqlJadwal = `SELECT j.*, s.nama FROM jadwal_dinas j JOIN sdm s ON j.sdm_id = s.id WHERE UPPER(TRIM(j.ruangan)) = UPPER(TRIM(?)) AND CAST(j.tahun AS INTEGER) = ? AND CAST(j.bulan AS INTEGER) = ?`;
        argsJadwal = [kunciRuangan, pTahun, pBulan];
    }
    const resJadwal = await turso.execute({ sql: sqlJadwal, args: argsJadwal });
    const semuaJadwalBulanIni = resJadwal.rows;

    // 4. Ambil Data Pasien Poli (DITARIK SEBULAN PENUH)
    let sqlPasien = "";
    let argsPasien = [];
    if (isModeLaporan) {
        sqlPasien = `SELECT * FROM jumlah_pasien_poli WHERE date(substr('0000' || tahun, -4, 4) || '-' || substr('00' || bulan, -2, 2) || '-' || substr('00' || tanggal, -2, 2)) BETWEEN ? AND ?`;
        argsPasien = [queryTglAwalBulan, queryTglAkhirBulan];
    } else {
        sqlPasien = `SELECT * FROM jumlah_pasien_poli WHERE CAST(tahun AS INTEGER) = ? AND CAST(bulan AS INTEGER) = ?`;
        argsPasien = [pTahun, pBulan];
    }
    const resPasienPoli = await turso.execute({ sql: sqlPasien, args: argsPasien });
    const dataPasienBulanIni = resPasienPoli.rows;

    // 5. Ambil Data Cuti SDM & Dokter
    const [resSdmCuti, resDokterCuti] = await Promise.all([
      turso.execute({
        sql: `SELECT * FROM cuti_sdm WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?)) AND (strftime('%m', tgl_mulai) = ? OR strftime('%m', tgl_selesai) = ?) ORDER BY id DESC LIMIT 20`,
        args: [kunciRuangan, String(pBulan).padStart(2, '0'), String(pBulan).padStart(2, '0')]
      }),
      turso.execute({
        sql: `SELECT * FROM cuti_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?)) AND (strftime('%m', tgl_mulai) = ? OR strftime('%m', tgl_selesai) = ?)`,
        args: [kunciRuangan, String(pBulan).padStart(2, '0'), String(pBulan).padStart(2, '0')]
      })
    ]);

    // 6. Ambil Master Dokter
    const resMasterDokterAll = await turso.execute({
      sql: "SELECT * FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [kunciRuangan]
    });

    let resMasterDokterHariIni;
    if (isModeLaporan) {
      resMasterDokterHariIni = resMasterDokterAll;
    } else {
      resMasterDokterHariIni = await turso.execute({
        sql: "SELECT * FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?)) AND jadwal_hari = ?",
        args: [kunciRuangan, namaHariIndo]
      });
    }

    // FUNGSI PENGAMANAN STRING (Melindungi dari Error NULL dan mengatasi bug angka 0)
    const amanStr = (str) => String(str || "").trim().toUpperCase();

    const getSimbolGrupGlobal = (jadwalSimbol) => {
      // PERBAIKAN: Jika jadwalSimbol = "0" atau 0, kita proses dengan aman
      if (jadwalSimbol === null || jadwalSimbol === undefined || jadwalSimbol === "") return "LAINNYA";
      let jSimbol = amanStr(jadwalSimbol);
      let docMatch = resMasterDokterAll.rows.find(md => 
        amanStr(md.klinik) === jSimbol || amanStr(md.simbol_praktik) === jSimbol
      );
      return docMatch ? amanStr(docMatch.simbol_praktik) : jSimbol;
    };

    const getSimbolGrupHariIni = getSimbolGrupGlobal;

    const dokterPraktik = resMasterDokterHariIni.rows.map(dok => {
      const recordPasienHarian = !isModeLaporan ? dataPasienBulanIni.find(p => 
        amanStr(p.nama_dokter) === amanStr(dok.nama_dokter) && 
        amanStr(p.klinik) === amanStr(dok.klinik) && 
        Number(p.tanggal) === pTanggal
      ) : null;

      const listPasienRentang = dataPasienBulanIni.filter(p => 
        amanStr(p.nama_dokter) === amanStr(dok.nama_dokter) && 
        amanStr(p.klinik) === amanStr(dok.klinik)
      );
      const totalPasienRentang = listPasienRentang.reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0);

      const timHarian = !isModeLaporan ? semuaJadwalBulanIni.filter(j => 
        Number(j.tanggal) === pTanggal && getSimbolGrupGlobal(j.simbol) === amanStr(dok.simbol_praktik)
      ) : [];

      const isCuti = !isModeLaporan ? resDokterCuti.rows.some(c => 
        amanStr(c.nama_dokter) === amanStr(dok.nama_dokter) && 
        formatTglTarget >= c.tgl_mulai && formatTglTarget <= c.tgl_selesai
      ) : false;

      return {
        ...dok,
        isCuti,
        jumlah_pasien_poli: recordPasienHarian ? Number(recordPasienHarian.jumlah) : 0, 
        total_pasien_bulanan: totalPasienRentang, 
        timAsisten: timHarian.map(t => ({ id: t.sdm_id, nama: t.nama }))
      };
    });

    /**
     * ALGORITMA BARU: Kalkulasi Poin yang Benar dan Dibagi Rata Sesuai Jumlah Asisten
     */
    const dailyPointsDict = {}; 
    
    // a. Kumpulkan total kunjungan pasien per grup simbol (e.g., Semua pasien NERS 3 hari itu)
    dataPasienBulanIni.forEach(p => {
        const dokMatch = resMasterDokterAll.rows.find(md => 
            amanStr(md.nama_dokter) === amanStr(p.nama_dokter) && 
            amanStr(md.klinik) === amanStr(p.klinik)
        );
        const simbol = dokMatch ? amanStr(dokMatch.simbol_praktik) : (amanStr(p.klinik) || "LAINNYA");
        const dateKey = `${Number(p.tahun)}-${Number(p.bulan)}-${Number(p.tanggal)}_${simbol}`;
        
        if (!dailyPointsDict[dateKey]) {
            dailyPointsDict[dateKey] = { totalPasien: 0, jumlahAsisten: 0, poin: 0 };
        }
        dailyPointsDict[dateKey].totalPasien += Number(p.jumlah || 0);
    });

    // b. Hitung berapa jumlah asisten perawat di masing-masing grup simbol hari itu
    semuaJadwalBulanIni.forEach(j => {
        const simbol = getSimbolGrupGlobal(j.simbol);
        const dateKey = `${Number(j.tahun)}-${Number(j.bulan)}-${Number(j.tanggal)}_${simbol}`;
        
        if (!dailyPointsDict[dateKey]) {
            dailyPointsDict[dateKey] = { totalPasien: 0, jumlahAsisten: 0, poin: 0 };
        }
        dailyPointsDict[dateKey].jumlahAsisten += 1;
    });

    // c. Kalkulasi poin akhir = Total Pasien Grup / Jumlah Asisten Grup
    for (const key in dailyPointsDict) {
        const data = dailyPointsDict[key];
        const asisten = data.jumlahAsisten > 0 ? data.jumlahAsisten : 1;
        data.poin = Math.round(data.totalPasien / asisten);
    }

    // Langkah 2: Distribusikan Poin yang Sudah Dihitung Rata ke Masing-Masing Perawat
    const perawatUnik = [...new Set(semuaJadwalBulanIni.map(j => j.sdm_id))];
    const leaderboardBeban = perawatUnik.map(idSdm => {
      const infoSdm = semuaJadwalBulanIni.find(j => j.sdm_id === idSdm);
      let totalBebanBulanan = 0;
      let totalBebanHariIni = 0;
      const daftarPoliDibantuHariIni = new Set(); 

      const riwayatJadwalSdm = semuaJadwalBulanIni.filter(j => j.sdm_id === idSdm);

      riwayatJadwalSdm.forEach(jadwal => {
        const targetSimbolGroup = getSimbolGrupGlobal(jadwal.simbol);
        const dateKey = `${Number(jadwal.tahun)}-${Number(jadwal.bulan)}-${Number(jadwal.tanggal)}_${targetSimbolGroup}`;
        
        const poinHarian = dailyPointsDict[dateKey] ? dailyPointsDict[dateKey].poin : 0;
        
        totalBebanBulanan += poinHarian;

        // Identifikasi jadwal khusus HARI INI
        if (Number(jadwal.tanggal) === pTanggal && Number(jadwal.bulan) === pBulan && Number(jadwal.tahun) === pTahun) {
            totalBebanHariIni += poinHarian;
            
            if (targetSimbolGroup.startsWith('NERS')) {
                daftarPoliDibantuHariIni.add(targetSimbolGroup); 
            } else {
                const namaPoliBersih = targetSimbolGroup.replace('POLI', '').trim();
                daftarPoliDibantuHariIni.add(`POLI ${namaPoliBersih}`); 
            }
        }
      });

      let teksPoli = Array.from(daftarPoliDibantuHariIni).join(", ");
      if (!teksPoli) teksPoli = "OFF / LIBUR";

      return {
        id: idSdm,
        nama: infoSdm.nama,
        total_pasien_bulanan: totalBebanBulanan,
        total_pasien_hari_ini: totalBebanHariIni,
        detail_poli: teksPoli
      };
    }).filter(p => p.nama !== 'ADMIN');

    // Urutkan berdasarkan total akumulasi sebulan terbanyak
    leaderboardBeban.sort((a, b) => b.total_pasien_bulanan - a.total_pasien_bulanan);

    const dataCutiSdmMapped = resSdmCuti.rows.map(s => ({
      nama_sdm: s.nama_sdm,
      jenis_cuti: s.jenis_cuti,
      status_acc: s.status_acc || "Menunggu",
      tgl_mulai: format(new Date(s.tgl_mulai), "dd MMM"),
      tgl_selesai: format(new Date(s.tgl_selesai), "dd MMM")
    }));

    // BUSTER CACHE AGAR FRONTEND SELALU TERUPDATE SAAT DIKLIK SIMPAN
    return NextResponse.json({
      summary: {
        totalSDM: sdmCount.rows[0]?.total || 0,
        totalDokter: dokterCount.rows[0]?.total || 0,
        perawatMasuk: !isModeLaporan ? semuaJadwalBulanIni.filter(j => Number(j.tanggal) === pTanggal).length : perawatUnik.length,
        sdmIzinCount: resSdmCuti.rows.length,
        tanggal_hari_ini: pTanggal,
        isLaporan: isModeLaporan 
      },
      sdmCuti: dataCutiSdmMapped,
      dokterPraktik: dokterPraktik,
      leaderboard: leaderboardBeban
    }, {
      // HEADER INI MEMAKSA BROWSER MENGAMBIL DATA TERBARU DARI DATABASE, BUKAN DARI CACHE LAMA
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}