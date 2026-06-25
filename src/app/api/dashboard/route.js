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
      sql: "SELECT id, nama_dokter, klinik, jadwal_hari, jam_praktik, simbol_praktik, bobot_jaspel FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))",
      args: [kunciRuangan]
    });

    let resMasterDokterHariIni;
    if (isModeLaporan) {
      resMasterDokterHariIni = resMasterDokterAll;
    } else {
      resMasterDokterHariIni = await turso.execute({
        sql: "SELECT id, nama_dokter, klinik, jadwal_hari, jam_praktik, simbol_praktik, bobot_jaspel FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?)) AND jadwal_hari = ?",
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

      const timHarian = !isModeLaporan ? semuaJadwalBulanIni.filter(j => 
        Number(j.tanggal) === pTanggal && amanStr(j.simbol) === amanStr(dok.simbol_praktik)
      ) : [];

      const isCutiDokter = !isModeLaporan ? resDokterCuti.rows.some(c => 
        amanStr(c.nama_dokter) === amanStr(dok.nama_dokter) && 
        formatTglTarget >= c.tgl_mulai && formatTglTarget <= c.tgl_selesai
      ) : false;

      // Injeksi Status Cuti/Sakit untuk UI Coretan Merah
      const asistenMapped = timHarian.map(t => {
        const isCutiSDM = resSdmCuti.rows.some(c => 
            amanStr(c.nama_sdm) === amanStr(t.nama) &&
            c.status_acc === 'Disetujui' &&
            formatTglTarget >= c.tgl_mulai && formatTglTarget <= c.tgl_selesai
        );
        const isSakit = ['CS', 'S'].includes(amanStr(t.simbol));

        return { 
          id: t.sdm_id, 
          nama: t.nama, 
          isCuti: isCutiSDM,
          isSakit: isSakit
        };
      });

      return {
        ...dok,
        bobot_jaspel: dok.bobot_jaspel || 1.0, 
        isCuti: isCutiDokter,
        jumlah_pasien_poli: recordPasienHarian ? Number(recordPasienHarian.jumlah) : 0, 
        total_pasien_bulanan: totalPasienRentang, 
        timAsisten: asistenMapped
      };
    });

    /**
     * ALGORITMA FINAL: PEMBAGI DINAMIS & BOBOT JASPEL (SISI SERVER)
     */
    const dailyPointsDict = {}; 
    const getNamaHari = (thn, bln, tgl) => format(new Date(thn, bln - 1, tgl), "eeee", { locale: id });
    
    // a. Agregasi Pasien + Kalikan Bobot
    dataPasienBulanIni.forEach(p => {
        const namaHariPasien = getNamaHari(p.tahun, p.bulan, p.tanggal);
        
        const dokMatch = resMasterDokterAll.rows.find(md => 
            amanStr(md.nama_dokter) === amanStr(p.nama_dokter) && 
            amanStr(md.klinik) === amanStr(p.klinik) &&
            amanStr(md.jadwal_hari) === amanStr(namaHariPasien)
        );
        
        const simbol = dokMatch ? amanStr(dokMatch.simbol_praktik) : (amanStr(p.klinik) || "LAINNYA");
        const bobotDokter = dokMatch ? parseFloat(dokMatch.bobot_jaspel || 1.0) : 1.0;
        
        const dateKey = `${Number(p.tahun)}-${Number(p.bulan)}-${Number(p.tanggal)}_${simbol}`;
        
        if (!dailyPointsDict[dateKey]) {
            dailyPointsDict[dateKey] = { totalPasienKotor: 0, totalPoinBobot: 0, jumlahAsistenHadir: 0, poinFinal: 0 };
        }
        
        const hitunganPasien = Number(p.jumlah || 0);
        dailyPointsDict[dateKey].totalPasienKotor += hitunganPasien;
        dailyPointsDict[dateKey].totalPoinBobot += (hitunganPasien * bobotDokter);
    });

    // b. Hitung Asisten Hadir (Exlcude yang Sakit/Cuti/Libur)
    semuaJadwalBulanIni.forEach(j => {
        const simbolAsisten = amanStr(j.simbol);
        const dateKey = `${Number(j.tahun)}-${Number(j.bulan)}-${Number(j.tanggal)}_${simbolAsisten}`;
        
        if (!dailyPointsDict[dateKey]) {
            dailyPointsDict[dateKey] = { totalPasienKotor: 0, totalPoinBobot: 0, jumlahAsistenHadir: 0, poinFinal: 0 };
        }

        const dateStr = `${j.tahun}-${String(j.bulan).padStart(2,'0')}-${String(j.tanggal).padStart(2,'0')}`;
        
        // Pengecekan Absensi
        const isCutiAcc = resSdmCuti.rows.some(c => 
             amanStr(c.nama_sdm) === amanStr(j.nama) &&
             c.status_acc === 'Disetujui' &&
             dateStr >= c.tgl_mulai && dateStr <= c.tgl_selesai
        );
        const isSimbolAbsen = ['CT', 'CM', 'CS', 'S', 'I', 'L', 'OFF'].includes(simbolAsisten);

        // Jika dia masuk kerja, tambahkan sebagai pembagi
        if (!isCutiAcc && !isSimbolAbsen) {
             dailyPointsDict[dateKey].jumlahAsistenHadir += 1;
        }
    });

    // c. Kalkulasi Poin Akhir per Poli per Hari
    for (const key in dailyPointsDict) {
        const data = dailyPointsDict[key];
        const asistenPembagi = data.jumlahAsistenHadir > 0 ? data.jumlahAsistenHadir : 1;
        data.poinFinal = data.totalPoinBobot / asistenPembagi;
    }

    // Distribusi Poin ke Leaderboard Individu
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
        
        const dateStr = `${jadwal.tahun}-${String(jadwal.bulan).padStart(2,'0')}-${String(jadwal.tanggal).padStart(2,'0')}`;
        const isCutiAcc = resSdmCuti.rows.some(c => 
             amanStr(c.nama_sdm) === amanStr(infoSdm.nama) &&
             c.status_acc === 'Disetujui' &&
             dateStr >= c.tgl_mulai && dateStr <= c.tgl_selesai
        );
        const isSimbolAbsen = ['CT', 'CM', 'CS', 'S', 'I', 'L', 'OFF'].includes(targetSimbolGroup);

        // Jangan berikan poin jika perawat tersebut bolos/cuti hari itu
        if (!isCutiAcc && !isSimbolAbsen) {
             const poinHarian = dailyPointsDict[dateKey] ? dailyPointsDict[dateKey].poinFinal : 0;
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
        }
      });

      let teksPoli = Array.from(daftarPoliDibantuHariIni).join(", ");
      if (!teksPoli) teksPoli = "OFF / LIBUR";

      return {
        id: idSdm,
        nama: infoSdm.nama,
        total_pasien_bulanan: parseFloat(totalBebanBulanan.toFixed(1)),
        total_pasien_hari_ini: parseFloat(totalBebanHariIni.toFixed(1)),
        detail_poli: teksPoli,
        saldo_mutu: 400 // <-- Injeksi Saldo Dasar untuk fitur Kedisiplinan 400 Poin UI
      };
    }).filter(p => p.nama !== 'ADMIN');

    // Sorting Descending
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