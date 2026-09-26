import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function getSessionRuangan() {
  return cookies().then((cookieStore) => {
    const session = cookieStore.get("session_dak_pro");
    if (!session) return null;

    try {
      return JSON.parse(session.value)?.ruangan || null;
    } catch (error) {
      return null;
    }
  });
}

// =================================================================
// 1. FUNGSI GET: TARIK DATA SDM + AKUMULASI PASIEN + SALDO MUTU
// =================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userRuangan = await getSessionRuangan();

    if (!userRuangan) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bulan = parseInt(searchParams.get("bulan")) || new Date().getMonth() + 1;
    const tahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

    const resSdm = await turso.execute({
      sql: `SELECT s.*, sm.poin_akhir, sm.total_penalti
            FROM sdm s
            LEFT JOIN saldo_mutu sm ON s.id = sm.sdm_id AND sm.bulan = ? AND sm.tahun = ?
            WHERE s.is_aktif = 1
              AND (s.status_kerja IS NULL OR s.status_kerja NOT IN ('RESIGN', 'NON_AKTIF'))
              AND (
               s.ruangan_aktif IS NULL OR TRIM(s.ruangan_aktif) = '' OR UPPER(TRIM(s.ruangan_aktif)) = UPPER(TRIM(?))
              )
            ORDER BY s.nama ASC`,
      args: [bulan, tahun, userRuangan]
    });

    const daftarSdm = resSdm.rows.map((row) => ({
      ...row,
      poin_akhir: row.poin_akhir ?? 400,
    }));

    const [resJadwal, resPasienPoli, resMasterDokter] = await Promise.all([
      turso.execute({
        sql: `SELECT * FROM jadwal_dinas
              WHERE bulan = ? AND tahun = ? AND (
               ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              )`,
        args: [bulan, tahun, userRuangan]
      }),
      turso.execute({
        sql: `SELECT * FROM jumlah_pasien_poli WHERE bulan = ? AND tahun = ?`,
        args: [bulan, tahun]
      }),
      turso.execute({
        sql: `SELECT nama_dokter, klinik, simbol_praktik FROM master_dokter
              WHERE is_aktif = 1 AND (
               ruangan_aktif IS NULL OR TRIM(ruangan_aktif) = '' OR UPPER(TRIM(ruangan_aktif)) = UPPER(TRIM(?))
              )`,
        args: [userRuangan]
      })
    ]);

    const semuaJadwal = resJadwal.rows;
    const dataPasienPoli = resPasienPoli.rows;
    const masterDokter = resMasterDokter.rows;

    const getSimbolGrup = (jadwalSimbol) => {
      if (!jadwalSimbol) return "LAINNYA";
      const jSimbol = jadwalSimbol.trim().toUpperCase();
      const docMatch = masterDokter.find(
        (md) =>
          md.klinik?.trim().toUpperCase() === jSimbol ||
          md.simbol_praktik?.trim().toUpperCase() === jSimbol
      );
      return docMatch ? docMatch.simbol_praktik.trim().toUpperCase() : jSimbol;
    };

    const sdmFinal = daftarSdm.map((sdm) => {
      const jadwalSdm = semuaJadwal.filter((j) => j.sdm_id === sdm.id);

      let totalPasienMurni = 0;
      const setKlinik = new Set();

      jadwalSdm.forEach((hari) => {
        const targetSimbolGroup = getSimbolGrup(hari.simbol);
        const dokterHariIni = masterDokter.filter(
          (d) => d.simbol_praktik?.trim().toUpperCase() === targetSimbolGroup
        );

        if (dokterHariIni.length > 0) {
          let totalPasienStasiunHariIni = 0;

          dokterHariIni.forEach((dok) => {
            setKlinik.add(dok.klinik?.trim().toUpperCase());

            const recordPasien = dataPasienPoli.find(
              (p) =>
               p.nama_dokter?.trim().toUpperCase() === dok.nama_dokter?.trim().toUpperCase() &&
               p.klinik?.trim().toUpperCase() === dok.klinik?.trim().toUpperCase() &&
               p.tanggal === hari.tanggal
            );

            if (recordPasien && recordPasien.jumlah > 0) {
              totalPasienStasiunHariIni += recordPasien.jumlah;
            }
          });

          const jumlahAsistenDiPoli =
            semuaJadwal.filter(
              (j) => j.tanggal === hari.tanggal && getSimbolGrup(j.simbol) === targetSimbolGroup
            ).length || 1;

          totalPasienMurni += Math.round(totalPasienStasiunHariIni / jumlahAsistenDiPoli);
        } else if (hari.simbol) {
          setKlinik.add(hari.simbol.trim().toUpperCase());
        }
      });

      return {
        ...sdm,
        total_pasien: totalPasienMurni,
        daftar_klinik: Array.from(setKlinik).join(", "),
      };
    });

    return NextResponse.json(sdmFinal);
  } catch (error) {
    console.error("CRITICAL ERROR API SDM:", error);
    return NextResponse.json([], { status: 500 });
  }
}

// =================================================================
// 2. FUNGSI POST: EKSEKUSI PEMOTONGAN (VERSI GENERATED COLUMNS)
// =================================================================
export async function POST(request) {
  try {
    const body = await request.json();
    const { sdm_id, bulan, tahun, jenis, kategori, nominal, catatan } = body;

    if (!sdm_id || !kategori || nominal === undefined) {
      return NextResponse.json({ error: "Data eksekusi mutu tidak lengkap" }, { status: 400 });
    }

    const isPotong = jenis === "POTONG";
    const poinLog = isPotong ? nominal : -nominal;

    await turso.execute({
      sql: `INSERT INTO log_pengadilan_mutu (sdm_id, bulan, tahun, kategori_pelanggaran, poin_dipotong, catatan)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [sdm_id, bulan, tahun, kategori, poinLog, catatan || "Dieksekusi via Pengadilan Mutu"],
    });

    let kolomUpdate = "penalti_disiplin";
    if (kategori === "SOP_ETIKA") kolomUpdate = "penalti_sop";
    if (kategori === "ASKEP") kolomUpdate = "penalti_askep";

    const sqlOperator = isPotong ? "+" : "-";

    await turso.execute({
      sql: `
        INSERT INTO saldo_mutu (sdm_id, bulan, tahun, poin_awal, ${kolomUpdate})
        VALUES (?, ?, ?, 400, ?)
        ON CONFLICT(sdm_id, bulan, tahun) DO UPDATE SET
        ${kolomUpdate} = MAX(0, ${kolomUpdate} ${sqlOperator} ?),
        updated_at = CURRENT_TIMESTAMP
      `,
      args: [sdm_id, bulan, tahun, nominal, nominal],
    });

    return NextResponse.json({ success: true, message: "Eksekusi poin mutu berhasil dicatat ke sistem!" });
  } catch (error) {
    console.error("ERROR API POST PENGADILAN MUTU:", error);
    return NextResponse.json({ success: false, error: "Gagal mengeksekusi pengadilan mutu." }, { status: 500 });
  }
}