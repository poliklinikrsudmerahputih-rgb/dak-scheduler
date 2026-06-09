import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// =======================================================================
// 1. FUNGSI GET: MENGAMBIL DATA DASHBOARD & KALKULASI POIN LEADERBOARD
// =======================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // ISOLASI KEAMANAN
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

    // Parameter Tanggal
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

    const queryTglAwalInt = parseInt(queryTglAwalBulan.replace(/-/g, ''), 10);
    const queryTglAkhirInt = parseInt(queryTglAkhirBulan.replace(/-/g, ''), 10);

    // Ambil Summary Statis
    const sdmCount = await turso.execute({
      sql: "SELECT COUNT(*) as total FROM sdm WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [kunciRuangan]
    });
    const dokterCount = await turso.execute({
      sql: "SELECT COUNT(DISTINCT nama_dokter) as total FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [kunciRuangan]
    });

    // Ambil Jadwal Perawat
    let sqlJadwal = "";
    let argsJadwal = [];
    if (isModeLaporan) {
        sqlJadwal = `SELECT j.*, s.nama FROM jadwal_dinas j JOIN sdm s ON j.sdm_id = s.id 
                     WHERE UPPER(TRIM(j.ruangan)) = UPPER(TRIM(?)) 
                     AND (CAST(j.tahun AS INTEGER) * 10000 + CAST(j.bulan AS INTEGER) * 100 + CAST(j.tanggal AS INTEGER)) BETWEEN ? AND ?`;
        argsJadwal = [kunciRuangan, queryTglAwalInt, queryTglAkhirInt];
    } else {
        sqlJadwal = `SELECT j.*, s.nama FROM jadwal_dinas j JOIN sdm s ON j.sdm_id = s.id 
                     WHERE UPPER(TRIM(j.ruangan)) = UPPER(TRIM(?)) 
                     AND CAST(j.tahun AS INTEGER) = ? AND CAST(j.bulan AS INTEGER) = ?`;
        argsJadwal = [kunciRuangan, pTahun, pBulan];
    }
    const resJadwal = await turso.execute({ sql: sqlJadwal, args: argsJadwal });
    const semuaJadwalBulanIni = resJadwal.rows;

    // Ambil Data Pasien Poli
    let sqlPasien = "";
    let argsPasien = [];
    if (isModeLaporan) {
        sqlPasien = `SELECT * FROM jumlah_pasien_poli 
                     WHERE (CAST(tahun AS INTEGER) * 10000 + CAST(bulan AS INTEGER) * 100 + CAST(tanggal AS INTEGER)) BETWEEN ? AND ?`;
        argsPasien = [queryTglAwalInt, queryTglAkhirInt];
    } else {
        sqlPasien = `SELECT * FROM jumlah_pasien_poli 
                     WHERE CAST(tahun AS INTEGER) = ? AND CAST(bulan AS INTEGER) = ?`;
        argsPasien = [pTahun, pBulan];
    }
    const resPasienPoli = await turso.execute({ sql: sqlPasien, args: argsPasien });
    const dataPasienBulanIni = resPasienPoli.rows;

    // Ambil Data Cuti
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

    // Ambil Master Dokter
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

    const amanStr = (str) => String(str || "").trim().toUpperCase();

    // Mapping Dokter Praktik (Card UI)
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

      // LANGSUNG cocokkan dengan simbol di jadwal dinas hari itu
      const timHarian = !isModeLaporan ? semuaJadwalBulanIni.filter(j => 
        Number(j.tanggal) === pTanggal && amanStr(j.simbol) === amanStr(dok.simbol_praktik)
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
     * ALGORITMA FINAL: KALKULASI POIN (BERDASARKAN TANGGAL & HARI)
     */
    const dailyPointsDict = {}; 
    const getNamaHari = (thn, bln, tgl) => format(new Date(thn, bln - 1, tgl), "eeee", { locale: id });
    
    // a. Kumpulkan pasien berdasarkan nama dokter dan jadwal_hari dokter tersebut
    dataPasienBulanIni.forEach(p => {
        const namaHariPasien = getNamaHari(p.tahun, p.bulan, p.tanggal);
        
        // KUNCI PERBAIKAN: Cari simbol dokter SPESIFIK PADA HARI TERSEBUT
        const dokMatch = resMasterDokterAll.rows.find(md => 
            amanStr(md.nama_dokter) === amanStr(p.nama_dokter) && 
            amanStr(md.klinik) === amanStr(p.klinik) &&
            amanStr(md.jadwal_hari) === amanStr(namaHariPasien)
        );
        
        const simbol = dokMatch ? amanStr(dokMatch.simbol_praktik) : (amanStr(p.klinik) || "LAINNYA");
        const dateKey = `${Number(p.tahun)}-${Number(p.bulan)}-${Number(p.tanggal)}_${simbol}`;
        
        if (!dailyPointsDict[dateKey]) {
            dailyPointsDict[dateKey] = { totalPasien: 0, jumlahAsisten: 0, poin: 0 };
        }
        dailyPointsDict[dateKey].totalPasien += Number(p.jumlah || 0);
    });

    // b. Hitung jumlah asisten perawat langsung dari tabel jadwal dinas tanpa filter master
    semuaJadwalBulanIni.forEach(j => {
        const simbolAsisten = amanStr(j.simbol);
        const dateKey = `${Number(j.tahun)}-${Number(j.bulan)}-${Number(j.tanggal)}_${simbolAsisten}`;
        
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

    // Distribusikan Poin ke Leaderboard
    const perawatUnik = [...new Set(semuaJadwalBulanIni.map(j => j.sdm_id))];
    const leaderboardBeban = perawatUnik.map(idSdm => {
      const infoSdm = semuaJadwalBulanIni.find(j => j.sdm_id === idSdm);
      let totalBebanBulanan = 0;
      let totalBebanHariIni = 0;
      const daftarPoliDibantuHariIni = new Set(); 

      const riwayatJadwalSdm = semuaJadwalBulanIni.filter(j => j.sdm_id === idSdm);

      riwayatJadwalSdm.forEach(jadwal => {
        const targetSimbolGroup = amanStr(jadwal.simbol);
        const dateKey = `${Number(jadwal.tahun)}-${Number(jadwal.bulan)}-${Number(jadwal.tanggal)}_${targetSimbolGroup}`;
        
        const poinHarian = dailyPointsDict[dateKey] ? dailyPointsDict[dateKey].poin : 0;
        totalBebanBulanan += poinHarian;

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

    leaderboardBeban.sort((a, b) => b.total_pasien_bulanan - a.total_pasien_bulanan);

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
        perawatMasuk: !isModeLaporan ? semuaJadwalBulanIni.filter(j => Number(j.tanggal) === pTanggal).length : perawatUnik.length,
        sdmIzinCount: resSdmCuti.rows.length,
        tanggal_hari_ini: pTanggal,
        isLaporan: isModeLaporan 
      },
      sdmCuti: dataCutiSdmMapped,
      dokterPraktik: dokterPraktik,
      leaderboard: leaderboardBeban
    }, {
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

// =======================================================================
// 2. FUNGSI PATCH: MENYIMPAN DATA JUMLAH PASIEN (UPSERT BULLETPROOF)
// =======================================================================
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { nama_dokter, klinik, tanggal, bulan, tahun, jumlah } = body;

    const checkQuery = await turso.execute({
      sql: `SELECT id FROM jumlah_pasien_poli 
            WHERE nama_dokter = ? AND klinik = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [nama_dokter, klinik, tanggal, bulan, tahun]
    });

    if (checkQuery.rows.length > 0) {
      await turso.execute({
        sql: `UPDATE jumlah_pasien_poli SET jumlah = ? 
              WHERE nama_dokter = ? AND klinik = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
        args: [jumlah, nama_dokter, klinik, tanggal, bulan, tahun]
      });
    } else {
      await turso.execute({
        sql: `INSERT INTO jumlah_pasien_poli (nama_dokter, klinik, jumlah, tanggal, bulan, tahun) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [nama_dokter, klinik, jumlah, tanggal, bulan, tahun]
      });
    }

    return NextResponse.json({ success: true, message: "Data pasien tersimpan" });

  } catch (error) {
    console.error("Gagal push ke database:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}