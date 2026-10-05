import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const normalizeDoctorIdentity = (value) => String(value || "").trim().replace(/\s+/g, " ").toUpperCase();

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
    const cutiRangeStart = queryTglAwalBulan;
    const cutiRangeEnd = queryTglAkhirBulan;

    // Prepare reusable clause
    const ruanganMatchClause = `(j.ruangan IS NULL OR TRIM(j.ruangan) = '' OR UPPER(TRIM(j.ruangan)) = UPPER(TRIM(?)))`;

    // Prepare SQL for jadwal
    let sqlJadwal = "";
    let argsJadwal = [];
    if (isModeLaporan) {
        sqlJadwal = `SELECT j.*, s.nama FROM jadwal_dinas j JOIN sdm s ON j.sdm_id = s.id 
                     WHERE ${ruanganMatchClause} 
                     AND (CAST(j.tahun AS INTEGER) * 10000 + CAST(j.bulan AS INTEGER) * 100 + CAST(j.tanggal AS INTEGER)) BETWEEN ? AND ?`;
        argsJadwal = [kunciRuangan, queryTglAwalInt, queryTglAkhirInt];
    } else {
        sqlJadwal = `SELECT j.*, s.nama FROM jadwal_dinas j JOIN sdm s ON j.sdm_id = s.id 
                     WHERE ${ruanganMatchClause} 
                     AND j.tahun = ? AND j.bulan = ?`;
        argsJadwal = [kunciRuangan, pTahun, pBulan];
    }

    // Prepare SQL for pasien
    let sqlPasien = "";
    let argsPasien = [];
    if (isModeLaporan) {
        sqlPasien = `SELECT nama_dokter, klinik, tanggal, bulan, tahun, jumlah FROM jumlah_pasien_poli
                     WHERE (CAST(tahun AS INTEGER) * 10000 + CAST(bulan AS INTEGER) * 100 + CAST(tanggal AS INTEGER)) BETWEEN ? AND ?`;
        argsPasien = [queryTglAwalInt, queryTglAkhirInt];
    } else {
        sqlPasien = `SELECT nama_dokter, klinik, tanggal, bulan, tahun, jumlah FROM jumlah_pasien_poli
                     WHERE tahun = ? AND bulan = ?`;
        argsPasien = [pTahun, pBulan];
    }

    const sqlMasterDokter = `SELECT id, nama_dokter, klinik, jadwal_hari, jam_praktik, simbol_praktik, bobot_jaspel, keterangan_simbol, ruangan
                             FROM master_dokter
                             WHERE ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
                             ORDER BY id ASC`;

    // Launch every independent dashboard read in the same round trip window.
    const [sdmCountRes, dokterCountRes, resJadwal, resPasienPoli, resAbsensiHariIni, resWaktuPraktik, resSdmCuti, resDokterCuti, resMasterDokterAll] = await Promise.all([
      turso.execute({ sql: "SELECT COUNT(*) as total FROM sdm WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))", args: [kunciRuangan] }),
      turso.execute({ sql: "SELECT COUNT(DISTINCT nama_dokter) as total FROM master_dokter WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))", args: [kunciRuangan] }),
      turso.execute({ sql: sqlJadwal, args: argsJadwal }),
      turso.execute({ sql: sqlPasien, args: argsPasien }),
      turso.execute({
        sql: `SELECT * FROM absensi 
              WHERE tanggal = ? 
                AND (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?)))`,
        args: [formatTglTarget, kunciRuangan]
      }),
      turso.execute({
        sql: `SELECT dokter_id, tanggal, jam_mulai_aktual FROM indikator_mutu_praktik
              WHERE ruangan = ? AND tanggal BETWEEN ? AND ?`,
        args: [kunciRuangan, queryTglAwalBulan, queryTglAkhirBulan]
      }).catch(() => ({ rows: [] })),
      turso.execute({
        sql: `SELECT * FROM cuti_sdm
              WHERE (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?)))
                AND NOT (tgl_selesai < ? OR tgl_mulai > ?)
              ORDER BY id DESC LIMIT 50`,
        args: [kunciRuangan, cutiRangeStart, cutiRangeEnd]
      }),
      turso.execute({
        sql: `SELECT * FROM cuti_dokter
              WHERE (ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?)))
                AND NOT (tgl_selesai < ? OR tgl_mulai > ?)`,
        args: [kunciRuangan, cutiRangeStart, cutiRangeEnd]
      }),
      turso.execute({ sql: sqlMasterDokter, args: [kunciRuangan] })
    ]);

    const dokterRowsForCard = (isModeLaporan ? resMasterDokterAll.rows : resMasterDokterAll.rows.filter(dok =>
      String(dok.jadwal_hari || "").trim().toUpperCase() === namaHariIndo.trim().toUpperCase()
    ));
    const dokterByIdentity = new Map();
    for (const dokter of dokterRowsForCard) {
      const key = `${normalizeDoctorIdentity(dokter.nama_dokter)}|${normalizeDoctorIdentity(dokter.klinik)}`;
      if (!dokterByIdentity.has(key)) dokterByIdentity.set(key, dokter);
    }
    const resMasterDokterHariIni = {
      rows: [...dokterByIdentity.values()]
    };

    const semuaJadwalBulanIni = resJadwal.rows;
    const dataPasienBulanIni = resPasienPoli.rows;

    const absensiMap = resAbsensiHariIni.rows.reduce((acc, row) => {
      acc[row.sdm_id] = row;
      return acc;
    }, {});
    const waktuPraktikMap = new Map(resWaktuPraktik.rows
      .filter(row => row.tanggal === formatTglTarget)
      .map(row => [Number(row.dokter_id), row.jam_mulai_aktual]));

    // Backwards-compat: expose variables expected by later code
    const sdmCount = sdmCountRes;
    const dokterCount = dokterCountRes;

    const amanStr = (str) => String(str || "").trim().toUpperCase();
    const normalizeDoctorName = (str) => amanStr(str).replace(/\s+/g, " ");
    const dateKey = (value) => String(value || "").trim().slice(0, 10);
    const isMaternityLeave = (value) => {
      const status = amanStr(value);
      return status === "CM" || status.includes("MELAHIR");
    };
    const normalizeSimbol = (str) => String(str || "")
      .trim()
      .replace(/[^A-Za-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    const getSimbolKey = (value) => {
      const normalized = normalizeSimbol(value);
      if (!normalized) return "";

      const nersMatch = normalized.match(/NERS\s*\d+/i);
      if (nersMatch) return nersMatch[0].replace(/\s+/g, " ").trim().toUpperCase();

      const poliMatch = normalized.match(/POLI\s*[A-Z0-9]+/i);
      if (poliMatch) return poliMatch[0].replace(/\s+/g, " ").trim().toUpperCase();

      return normalized;
    };

    const normalizeKey = (str) => String(str || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    const buildMapKey = (nama, klinik) => `${normalizeKey(nama)}|${normalizeKey(klinik)}`;

    const masterDokterByExact = new Map();
    const masterDokterByNama = new Map();
    const masterDokterByKlinik = new Map();
    const masterDokterBySimbol = new Map();
    const masterDokterByJadwalHari = new Map();

    resMasterDokterAll.rows.forEach(md => {
      const exactKey = buildMapKey(md.nama_dokter, md.klinik);
      if (!masterDokterByExact.has(exactKey)) masterDokterByExact.set(exactKey, md);

      const namaKey = normalizeKey(md.nama_dokter);
      if (namaKey && !masterDokterByNama.has(namaKey)) masterDokterByNama.set(namaKey, md);

      const klinikKey = normalizeKey(md.klinik);
      if (klinikKey && !masterDokterByKlinik.has(klinikKey)) masterDokterByKlinik.set(klinikKey, md);

      const simbolKey = normalizeSimbol(md.simbol_praktik || md.klinik || md.nama_dokter);
      if (simbolKey && !masterDokterBySimbol.has(simbolKey)) masterDokterBySimbol.set(simbolKey, md);

      const jadwalHariKey = normalizeKey(md.jadwal_hari);
      if (jadwalHariKey && !masterDokterByJadwalHari.has(jadwalHariKey)) masterDokterByJadwalHari.set(jadwalHariKey, md);
    });

    const findMasterDokter = (namaDokter, klinik) => {
      const exactKey = buildMapKey(namaDokter, klinik);
      if (masterDokterByExact.has(exactKey)) return masterDokterByExact.get(exactKey);

      const targetNama = normalizeKey(namaDokter);
      const targetKlinik = normalizeKey(klinik);

      if (targetNama && masterDokterByNama.has(targetNama)) return masterDokterByNama.get(targetNama);
      if (targetKlinik && masterDokterByKlinik.has(targetKlinik)) return masterDokterByKlinik.get(targetKlinik);

      const combinedKey = normalizeSimbol(namaDokter || klinik);
      if (combinedKey && masterDokterBySimbol.has(combinedKey)) return masterDokterBySimbol.get(combinedKey);

      if (targetNama && masterDokterByJadwalHari.has(targetNama)) return masterDokterByJadwalHari.get(targetNama);

      return resMasterDokterAll.rows.find(md =>
        (targetNama && normalizeKey(md.nama_dokter) === targetNama) ||
        (targetKlinik && normalizeKey(md.klinik) === targetKlinik) ||
        normalizeSimbol(md.simbol_praktik) === combinedKey ||
        normalizeSimbol(md.klinik) === combinedKey ||
        normalizeSimbol(md.nama_dokter) === combinedKey
      );
    };

    const pasienByDokterKey = new Map();
    dataPasienBulanIni.forEach(p => {
      const doctorKey = buildMapKey(p.nama_dokter, p.klinik);
      if (!doctorKey || doctorKey === "|") return;

      let patientStats = pasienByDokterKey.get(doctorKey);
      if (!patientStats) {
        patientStats = { byDate: new Map(), total: 0 };
        pasienByDokterKey.set(doctorKey, patientStats);
      }

      const dateKey = `${Number(p.tahun)}-${Number(p.bulan)}-${Number(p.tanggal)}`;
      if (!patientStats.byDate.has(dateKey)) {
        patientStats.byDate.set(dateKey, Number(p.jumlah) || 0);
      }
      patientStats.total += Number(p.jumlah) || 0;
    });

    const simbolMatches = (a, b) => {
      const ka = getSimbolKey(a);
      const kb = getSimbolKey(b);
      if (!ka || !kb) return false;
      if (ka === kb) return true;

      const nersNumA = ka.match(/^NERS_(\d+)$/)?.[1];
      const nersNumB = kb.match(/^NERS_(\d+)$/)?.[1];
      if (nersNumA && nersNumB) return nersNumA === nersNumB;

      const poliA = ka.match(/^POLI_(.+)$/)?.[1];
      const poliB = kb.match(/^POLI_(.+)$/)?.[1];
      if (poliA && poliB) return poliA === poliB;

      const rawNumA = ka.match(/^(\d+)$/)?.[1];
      const rawNumB = kb.match(/^(\d+)$/)?.[1];
      if (rawNumA && rawNumB) return rawNumA === rawNumB;

      if (nersNumA && rawNumB) return nersNumA === rawNumB;
      if (nersNumB && rawNumA) return nersNumB === rawNumA;

      return false;
    };

    const numberEquals = (a, b) => String(a || "").trim() === String(b || "").trim();

    const simbolGrupCache = new Map();
    const getSimbolGrup = (jadwalSimbol) => {
      const jKey = getSimbolKey(jadwalSimbol);
      if (!jKey) return "LAINNYA";
      if (simbolGrupCache.has(jKey)) return simbolGrupCache.get(jKey);

      const docMatch = resMasterDokterAll.rows.find(md => {
        const namaDokterKey = getSimbolKey(md.nama_dokter);
        const klinikKey = getSimbolKey(md.klinik);
        const simbolPraktikKey = getSimbolKey(md.simbol_praktik);

        return (
          simbolPraktikKey === jKey ||
          klinikKey === jKey ||
          namaDokterKey === jKey ||
          simbolMatches(simbolPraktikKey, jKey) ||
          simbolMatches(klinikKey, jKey) ||
          simbolMatches(namaDokterKey, jKey)
        );
      });

      const group = docMatch ? getSimbolKey(docMatch.simbol_praktik) : jKey;
      simbolGrupCache.set(jKey, group);
      return group;
    };

    const isAsistenUntukDokter = (jadwal, dok) => {
      const jadwalKey = getSimbolKey(jadwal.simbol);
      if (!jadwalKey) return false;

      const dokterKey = getSimbolKey(dok.simbol_praktik);
      if (!dokterKey) return false;

      return simbolMatches(jadwalKey, dokterKey);
    };

    const jadwalHariIni = isModeLaporan ? [] : semuaJadwalBulanIni.filter(j => Number(j.tanggal) === pTanggal);

    // Mapping Dokter Praktik (Card UI)
    const dokterPraktik = resMasterDokterHariIni.rows.map(dok => {
      const doctorKey = buildMapKey(dok.nama_dokter, dok.klinik);
      const patientStats = pasienByDokterKey.get(doctorKey);
      const targetDateKey = `${pTahun}-${pBulan}-${pTanggal}`;
      const totalPasienHarian = patientStats?.byDate.get(targetDateKey) || 0;
      const totalPasienRentang = patientStats?.total || 0;

      const timHarian = jadwalHariIni.filter(j => isAsistenUntukDokter(j, dok));

      const cutiDokter = !isModeLaporan
        ? resDokterCuti.rows
          .filter(c =>
            normalizeDoctorName(c.nama_dokter) === normalizeDoctorName(dok.nama_dokter) &&
            formatTglTarget >= dateKey(c.tgl_mulai) &&
            formatTglTarget <= dateKey(c.tgl_selesai)
          )
          .sort((first, second) => Number(second.id) - Number(first.id))[0] || null
        : null;
      const isCutiDokter = Boolean(cutiDokter);

      // Gabungkan data absensi harian untuk setiap asisten perawat
      const asistenMapped = timHarian.map(t => {
        const isCutiSDM = resSdmCuti.rows.some(c => 
            amanStr(c.nama_sdm) === amanStr(t.nama) &&
            c.status_acc === 'Disetujui' &&
            formatTglTarget >= c.tgl_mulai && formatTglTarget <= c.tgl_selesai
        );
        const isSakit = ['CS', 'S'].includes(amanStr(t.simbol));
        const absensi = absensiMap[t.sdm_id] || null;

        return { 
          id: t.sdm_id, 
          nama: t.nama, 
          isCuti: isCutiSDM,
          isSakit: isSakit,
          status_absen: absensi?.status_kedisiplinan || null,
          potongan_absen: absensi?.penalti_mutu || 0,
          foto_masuk: absensi?.foto_masuk || null
        };
      });

      return {
        ...dok,
        jam_mulai_aktual: waktuPraktikMap.get(Number(dok.id)) || null,
        bobot_jaspel: dok.bobot_jaspel || 1.0, 
        isCuti: isCutiDokter,
        is_berhalangan: isCutiDokter,
        keterangan_berhalangan: cutiDokter?.jenis_cuti || null,
        jumlah_pasien_poli: !isModeLaporan ? totalPasienHarian : 0,
        total_pasien_bulanan: totalPasienRentang, 
        timAsisten: asistenMapped
      };
    }).filter(dokter =>
      !(dokter.is_berhalangan && isMaternityLeave(dokter.keterangan_berhalangan))
    );

    /**
     * ALGORITMA FINAL: PEMBAGI DINAMIS & BOBOT JASPEL (SISI SERVER)
     */
    const dailyPointsDict = {}; 
    const getNamaHari = (thn, bln, tgl) => format(new Date(thn, bln - 1, tgl), "eeee", { locale: id });
    
    // a. Agregasi Pasien + Kalikan Bobot
    dataPasienBulanIni.forEach(p => {
        const namaHariPasien = getNamaHari(p.tahun, p.bulan, p.tanggal);
        
        const dokMatch = findMasterDokter(p.nama_dokter, p.klinik) || resMasterDokterAll.rows.find(md => amanStr(md.jadwal_hari) === amanStr(namaHariPasien) && (amanStr(md.klinik) === amanStr(p.klinik) || amanStr(md.nama_dokter) === amanStr(p.nama_dokter)));
        
        const simbol = dokMatch ? normalizeSimbol(dokMatch.simbol_praktik) : normalizeSimbol(p.klinik || p.nama_dokter || "LAINNYA");
        const bobotDokter = dokMatch ? parseFloat(dokMatch.bobot_jaspel || 1.0) : 1.0;
        
        const dateKey = `${Number(p.tahun)}-${Number(p.bulan)}-${Number(p.tanggal)}_${simbol}`;
        
        if (!dailyPointsDict[dateKey]) {
            dailyPointsDict[dateKey] = { totalPasienKotor: 0, totalPoinBobot: 0, jumlahAsistenHadir: 0, poinFinal: 0 };
        }
        
        const hitunganPasien = Number(p.jumlah || 0);
        dailyPointsDict[dateKey].totalPasienKotor += hitunganPasien;
        dailyPointsDict[dateKey].totalPoinBobot += (hitunganPasien * bobotDokter);
    });

    // b. Hitung Asisten Hadir (Exclude yang Sakit/Cuti/Libur)
    semuaJadwalBulanIni.forEach(j => {
        const targetSimbolGroup = normalizeSimbol(getSimbolGrup(j.simbol));
        const dateKey = `${Number(j.tahun)}-${Number(j.bulan)}-${Number(j.tanggal)}_${targetSimbolGroup}`;
        
        if (!dailyPointsDict[dateKey]) {
            dailyPointsDict[dateKey] = { totalPasienKotor: 0, totalPoinBobot: 0, jumlahAsistenHadir: 0, poinFinal: 0 };
        }

        const dateStr = `${j.tahun}-${String(j.bulan).padStart(2,'0')}-${String(j.tanggal).padStart(2,'0')}`;
        const simbolAsisten = normalizeSimbol(j.simbol);
        
        const isCutiAcc = resSdmCuti.rows.some(c => 
             amanStr(c.nama_sdm) === amanStr(j.nama) &&
             c.status_acc === 'Disetujui' &&
             dateStr >= c.tgl_mulai && dateStr <= c.tgl_selesai
        );
        const isSimbolAbsen = ['CT', 'CM', 'CS', 'S', 'I', 'L', 'OFF'].includes(simbolAsisten);

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
const targetSimbolGroup = getSimbolKey(getSimbolGrup(jadwal.simbol));
        const dateKey = `${Number(jadwal.tahun)}-${Number(jadwal.bulan)}-${Number(jadwal.tanggal)}_${targetSimbolGroup}`;
        
        const dateStr = `${jadwal.tahun}-${String(jadwal.bulan).padStart(2,'0')}-${String(jadwal.tanggal).padStart(2,'0')}`;
        const simbolAsisten = normalizeSimbol(jadwal.simbol);
        const isCutiAcc = resSdmCuti.rows.some(c => 
             amanStr(c.nama_sdm) === amanStr(infoSdm.nama) &&
             c.status_acc === 'Disetujui' &&
             dateStr >= c.tgl_mulai && dateStr <= c.tgl_selesai
        );
        const isSimbolAbsen = ['CT', 'CM', 'CS', 'S', 'I', 'L', 'OFF'].includes(simbolAsisten);

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
        total_pasien: parseFloat(totalBebanBulanan.toFixed(1)),
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

    const sdmIzinRaw = resSdmCuti.rows.map(s => ({
      nama_sdm: s.nama_sdm,
      jenis_cuti: s.jenis_cuti || 'Izin',
      status_acc: s.status_acc || 'Menunggu',
      tgl_mulai: s.tgl_mulai,
      tgl_selesai: s.tgl_selesai,
      ruangan: s.ruangan,
      sumber: 'cuti'
    }));

    const sdmSakitList = semuaJadwalBulanIni
      .filter(j => ['CS', 'S'].includes(amanStr(j.simbol)))
      .map(j => ({
        nama_sdm: j.nama,
        jenis_cuti: 'Sakit',
        status_acc: 'Tercatat',
        tgl_mulai: `${String(j.tahun).padStart(4,'0')}-${String(j.bulan).padStart(2,'0')}-${String(j.tanggal).padStart(2,'0')}`,
        tgl_selesai: `${String(j.tahun).padStart(4,'0')}-${String(j.bulan).padStart(2,'0')}-${String(j.tanggal).padStart(2,'0')}`,
        ruangan: j.ruangan,
        sumber: 'sakit'
      }));

    const sdmIzinList = [...sdmIzinRaw, ...sdmSakitList].reduce((acc, cur) => {
      const key = `${cur.nama_sdm}|${cur.tgl_mulai}|${cur.jenis_cuti}`;
      if (!acc.map[key]) {
        acc.map[key] = true;
        acc.items.push(cur);
      }
      return acc;
    }, { map: {}, items: [] }).items;

    const datesInMonth = [];
    const daysInMonth = new Date(pTahun, pBulan, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(pTahun, pBulan - 1, day);
      datesInMonth.push({
        tanggal: day,
        dateStr: format(date, "yyyy-MM-dd"),
        namaHari: format(date, "eeee", { locale: id })
      });
    }

    const totalPasienGroupPerHari = {};
    const totalPasienPerTanggal = new Map();
    const patientGroupPresence = new Set();
    const patientDoctorDatePresence = new Set();
    dataPasienBulanIni.forEach(p => {
      const pasienDokter = findMasterDokter(p.nama_dokter, p.klinik);
      const groupSimbol = normalizeSimbol(getSimbolGrup(pasienDokter?.simbol_praktik || p.klinik || p.nama_dokter));
      const dateKey = `${String(p.tahun).padStart(4,'0')}-${String(p.bulan).padStart(2,'0')}-${String(p.tanggal).padStart(2,'0')}`;
      const groupKey = `${dateKey}_${groupSimbol}`;
      totalPasienGroupPerHari[groupKey] = (totalPasienGroupPerHari[groupKey] || 0) + Number(p.jumlah || 0);
      const day = Number(p.tanggal);
      totalPasienPerTanggal.set(day, (totalPasienPerTanggal.get(day) || 0) + (Number(p.jumlah) || 0));
      patientGroupPresence.add(groupKey);
      patientDoctorDatePresence.add(`${amanStr(p.nama_dokter)}|${amanStr(p.klinik)}|${Number(p.tanggal)}`);
    });

    const doctorBySymbolGroup = new Map();
    resMasterDokterAll.rows.forEach(dok => {
      const groupKey = getSimbolGrup(dok.simbol_praktik);
      if (!doctorBySymbolGroup.has(groupKey)) doctorBySymbolGroup.set(groupKey, dok);
    });

    const missingPasienEntries = [];

    // Perawat / SDM: jadwal ada tetapi belum tercatat total pasien untuk grup simbol yang sama
    semuaJadwalBulanIni.forEach(j => {
      const dateString = `${String(j.tahun).padStart(4, '0')}-${String(j.bulan).padStart(2, '0')}-${String(j.tanggal).padStart(2, '0')}`;
      const targetGroupSimbol = getSimbolGrup(j.simbol);
      const kunci = `${dateString}_${targetGroupSimbol}`;
      const hasPatient = (totalPasienGroupPerHari[kunci] || 0) > 0;
      const isCutiAcc = resSdmCuti.rows.some(c =>
        amanStr(c.nama_sdm) === amanStr(j.nama) &&
        c.status_acc === 'Disetujui' &&
        dateString >= c.tgl_mulai && dateString <= c.tgl_selesai
      );
      const isSimbolAbsen = ['CT', 'CM', 'CS', 'S', 'I', 'L', 'OFF'].includes(amanStr(j.simbol));

      // Periksa ulang dengan nyaris nama dokter + klinik agar tidak memunculkan false positive
      const hasPatientAlternative = patientGroupPresence.has(kunci);

      if (!hasPatient && !hasPatientAlternative && !isCutiAcc && !isSimbolAbsen) {
        const dokterTerkait = doctorBySymbolGroup.get(targetGroupSimbol);
        missingPasienEntries.push({
          nama: j.nama,
          role: 'SDM',
          klinik: dokterTerkait?.klinik || j.klinik || j.ruangan || 'Umum',
          tanggal: dateString,
          label: `${j.nama} - ${String(j.tanggal).padStart(2, '0')}/${String(j.bulan).padStart(2, '0')}/${j.tahun}`,
          alasan: dokterTerkait ? `Belum ada total pasien untuk dokter ${dokterTerkait.nama_dokter}` : 'Jadwal terdaftar tanpa total pasien'
        });
      }
    });

    // Dokter: praktik terjadwal pada hari tertentu tetapi jumlah pasien belum terinput
    resMasterDokterAll.rows.forEach(dok => {
      datesInMonth.forEach(day => {
        if (amanStr(dok.jadwal_hari) !== amanStr(day.namaHari)) return;

        const hasPatient = patientDoctorDatePresence.has(`${amanStr(dok.nama_dokter)}|${amanStr(dok.klinik)}|${Number(day.tanggal)}`);

        const isCutiDokter = resDokterCuti.rows.some(c =>
          amanStr(c.nama_dokter) === amanStr(dok.nama_dokter) &&
          day.dateStr >= c.tgl_mulai && day.dateStr <= c.tgl_selesai
        );

        if (!hasPatient && !isCutiDokter) {
          missingPasienEntries.push({
            nama: dok.nama_dokter,
            role: 'Dokter',
            klinik: dok.klinik,
            tanggal: day.dateStr,
            label: `${dok.nama_dokter} - ${day.tanggal.toString().padStart(2, '0')}/${String(pBulan).padStart(2, '0')}/${pTahun}`,
            alasan: 'Praktik dokter belum memiliki total pasien'
          });
        }
      });
    });

    const uniqueMissing = missingPasienEntries.reduce((acc, cur) => {
      const key = `${cur.nama}|${cur.tanggal}`;
      if (!acc.map[key]) {
        acc.map[key] = true;
        acc.items.push(cur);
      }
      return acc;
    }, { map: {}, items: [] }).items;

    const trenPasienHarian = datesInMonth.map(day => ({
      tanggal: day.tanggal,
      pasien: totalPasienPerTanggal.get(day.tanggal) || 0
    }));
    const masterDokterById = new Map(resMasterDokterAll.rows.map(dok => [Number(dok.id), dok]));
    const mutuPraktik = resWaktuPraktik.rows.reduce((summary, row) => {
      const doctor = masterDokterById.get(Number(row.dokter_id));
      const scheduledTime = String(doctor?.jam_praktik || "").match(/(\d{1,2})[:.](\d{2})/);
      const actualTime = new Date(row.jam_mulai_aktual || "");
      if (!scheduledTime || Number.isNaN(actualTime.getTime())) return summary;

      const actualParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).formatToParts(actualTime);
      const actualValues = Object.fromEntries(actualParts.map(part => [part.type, part.value]));
      const scheduledMinutes = Number(scheduledTime[1]) * 60 + Number(scheduledTime[2]);
      const actualMinutes = Number(actualValues.hour) * 60 + Number(actualValues.minute);

      if (actualMinutes - scheduledMinutes <= 15) summary.tepatWaktu += 1;
      else summary.terlambat += 1;
      return summary;
    }, { tepatWaktu: 0, terlambat: 0 });
    const totalPraktikTercatat = mutuPraktik.tepatWaktu + mutuPraktik.terlambat;
    mutuPraktik.kepatuhanPersen = totalPraktikTercatat
      ? Math.round((mutuPraktik.tepatWaktu / totalPraktikTercatat) * 100)
      : 0;

    return NextResponse.json({
      summary: {
        totalSDM: sdmCount.rows[0]?.total || 0,
        totalDokter: dokterCount.rows[0]?.total || 0,
        perawatMasuk: !isModeLaporan ? semuaJadwalBulanIni.filter(j => Number(j.tanggal) === pTanggal).length : perawatUnik.length,
        sdmIzinCount: resSdmCuti.rows.length,
        tanggal_hari_ini: pTanggal,
        isLaporan: isModeLaporan,
        ruangan: kunciRuangan
      },
      sdmCuti: dataCutiSdmMapped,
      sdmIzinList,
      cutiSdmRaw: resSdmCuti.rows,
      dokterPraktik: dokterPraktik,
      leaderboard: leaderboardBeban,
      missingPasien: uniqueMissing,
      totalPasienBulanIni: dataPasienBulanIni.reduce((total, row) => total + (Number(row.jumlah) || 0), 0),
      trenPasienHarian,
      mutuPraktik
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
    let { nama_dokter, klinik, tanggal, bulan, tahun, jumlah } = body || {};
    nama_dokter = String(nama_dokter || '').replace(/\s+/g, ' ').trim();
    klinik = String(klinik || '').replace(/\s+/g, ' ').trim();
    tanggal = String(tanggal || '').trim();
    bulan = String(bulan || '').trim();
    tahun = String(tahun || '').trim();
    jumlah = Number(jumlah || 0);

    console.log('[PATCH /api/dashboard] incoming:', { nama_dokter, klinik, tanggal, bulan, tahun, jumlah });

    let matchedNama = nama_dokter;
    let matchedKlinik = klinik;
    const [resExact, resName, resKlinik] = await Promise.all([
      turso.execute({
        sql: `SELECT nama_dokter, klinik FROM master_dokter WHERE TRIM(LOWER(nama_dokter)) = TRIM(LOWER(?)) AND TRIM(LOWER(klinik)) = TRIM(LOWER(?)) LIMIT 1`,
        args: [nama_dokter, klinik]
      }),
      turso.execute({
        sql: `SELECT nama_dokter, klinik FROM master_dokter WHERE TRIM(LOWER(nama_dokter)) = TRIM(LOWER(?)) LIMIT 1`,
        args: [nama_dokter]
      }),
      turso.execute({
        sql: `SELECT nama_dokter, klinik FROM master_dokter WHERE TRIM(LOWER(klinik)) = TRIM(LOWER(?)) LIMIT 1`,
        args: [klinik]
      })
    ]);
    const canonicalDoctor = resExact.rows[0] || resName.rows[0] || resKlinik.rows[0];
    if (canonicalDoctor) {
      matchedNama = canonicalDoctor.nama_dokter;
      matchedKlinik = canonicalDoctor.klinik;
    }

    if (!nama_dokter || !klinik || !tanggal || !bulan || !tahun) {
      return NextResponse.json({ error: 'Invalid payload: missing required fields' }, { status: 400 });
    }

    const checkQuery = await turso.execute({
      sql: `SELECT id FROM jumlah_pasien_poli 
            WHERE TRIM(LOWER(nama_dokter)) = TRIM(LOWER(?)) AND TRIM(LOWER(klinik)) = TRIM(LOWER(?)) AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [matchedNama, matchedKlinik, tanggal, bulan, tahun]
    });

    if (checkQuery.rows.length > 0) {
      await turso.execute({
        sql: `UPDATE jumlah_pasien_poli SET jumlah = ? 
              WHERE TRIM(LOWER(nama_dokter)) = TRIM(LOWER(?)) AND TRIM(LOWER(klinik)) = TRIM(LOWER(?)) AND tanggal = ? AND bulan = ? AND tahun = ?`,
        args: [jumlah, matchedNama, matchedKlinik, tanggal, bulan, tahun]
      });
    } else {
      await turso.execute({
        sql: `INSERT INTO jumlah_pasien_poli (nama_dokter, klinik, jumlah, tanggal, bulan, tahun) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [matchedNama, matchedKlinik, jumlah, tanggal, bulan, tahun]
      });
    }

    return NextResponse.json({ success: true, message: 'Data pasien tersimpan' });

  } catch (error) {
    console.error("Gagal push ke database:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
