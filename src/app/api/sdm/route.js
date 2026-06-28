import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// =================================================================
// 1. FUNGSI GET: TARIK DATA SDM + AKUMULASI PASIEN + SALDO MUTU
// =================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    // Parameter Filter Waktu (Default Bulan & Tahun Berjalan)
    const bulan = parseInt(searchParams.get("bulan")) || (new Date().getMonth() + 1);
    const tahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

    // Identifikasi Ruangan User
    let userRuangan = "POLIKLINIK"; 
    if (session) {
      try {
        const userData = JSON.parse(session.value);
        userRuangan = userData.ruangan || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama atau tidak valid");
      }
    }

    // 1. Ambil data dasar SDM + LEFT JOIN ke saldo_mutu agar poin tampil
    // Kita tetap BISA mambaca (SELECT) poin_akhir meskipun dia kolom otomatis
    const resSdm = await turso.execute({
      sql: `SELECT s.*, sm.poin_akhir, sm.total_penalti 
            FROM sdm s
            LEFT JOIN saldo_mutu sm ON s.id = sm.sdm_id AND sm.bulan = ? AND sm.tahun = ?
            WHERE s.ruangan IS NULL 
               OR TRIM(s.ruangan) = '' 
               OR UPPER(TRIM(s.ruangan)) = UPPER(TRIM(?)) 
            ORDER BY s.nama ASC`,
      args: [bulan, tahun, userRuangan]
    });
    
    // Inject default 400 jika belum ada record di tabel saldo_mutu
    const daftarSdm = resSdm.rows.map(row => ({
        ...row,
        poin_akhir: row.poin_akhir ?? 400 
    }));

    // 2. Ambil komponen relasi dengan filter ruangan
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
              WHERE ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?))`,
        args: [userRuangan]
      })
    ]);

    const semuaJadwal = resJadwal.rows;
    const dataPasienPoli = resPasienPoli.rows;
    const masterDokter = resMasterDokter.rows;

    const getSimbolGrup = (jadwalSimbol) => {
      if (!jadwalSimbol) return "LAINNYA";
      let jSimbol = jadwalSimbol.trim().toUpperCase();
      let docMatch = masterDokter.find(md => 
        md.klinik.trim().toUpperCase() === jSimbol || 
        md.simbol_praktik.trim().toUpperCase() === jSimbol
      );
      return docMatch ? docMatch.simbol_praktik.trim().toUpperCase() : jSimbol;
    };

    // 3. PROSES PERHITUNGAN AKUMULASI VOLUME PASIEN BULANAN MURNI
    const sdmFinal = daftarSdm.map(sdm => {
      const jadwalSdm = semuaJadwal.filter(j => j.sdm_id === sdm.id);
      
      let totalPasienMurni = 0;
      let setKlinik = new Set();

      jadwalSdm.forEach(hari => {
        const targetSimbolGroup = getSimbolGrup(hari.simbol);
        const dokterHariIni = masterDokter.filter(d => 
          d.simbol_praktik.trim().toUpperCase() === targetSimbolGroup
        );

        if (dokterHariIni.length > 0) {
          let totalPasienStasiunHariIni = 0;

          dokterHariIni.forEach(dok => {
            setKlinik.add(dok.klinik.trim().toUpperCase());

            const recordPasien = dataPasienPoli.find(p => 
              p.nama_dokter.trim().toUpperCase() === dok.nama_dokter.trim().toUpperCase() && 
              p.klinik.trim().toUpperCase() === dok.klinik.trim().toUpperCase() && 
              p.tanggal === hari.tanggal
            );

            if (recordPasien && recordPasien.jumlah > 0) {
              totalPasienStasiunHariIni += recordPasien.jumlah;
            }
          });

          const jumlahAsistenDiPoli = semuaJadwal.filter(j => 
            j.tanggal === hari.tanggal && 
            getSimbolGrup(j.simbol) === targetSimbolGroup
          ).length || 1;

          totalPasienMurni += Math.round(totalPasienStasiunHariIni / jumlahAsistenDiPoli);
        } else {
          if (hari.simbol) {
            setKlinik.add(hari.simbol.trim().toUpperCase());
          }
        }
      });

      return {
        ...sdm,
        total_pasien: totalPasienMurni, 
        daftar_klinik: Array.from(setKlinik).join(", ")
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

      // 1. Catat ke Tabel Log (Riwayat)
      const isPotong = jenis === 'POTONG';
      const poinLog = isPotong ? nominal : -nominal;
      
      await turso.execute({
        sql: `INSERT INTO log_pengadilan_mutu (sdm_id, bulan, tahun, kategori_pelanggaran, poin_dipotong, catatan)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [sdm_id, bulan, tahun, kategori, poinLog, catatan || "Dieksekusi via Pengadilan Mutu"]
      });

      // 2. Tentukan Kolom Target Berdasarkan Kategori
      // KITA HANYA BOLEH MENG-UPDATE KOLOM INI, JANGAN SENTUH poin_akhir
      let kolomUpdate = "penalti_disiplin";
      if (kategori === "SOP_ETIKA") kolomUpdate = "penalti_sop";
      if (kategori === "ASKEP") kolomUpdate = "penalti_askep";
      
      // 3. Tentukan Operasi (Jika potong berarti penalti ditambah. Jika pemutihan berarti penalti dikurangi)
      const sqlOperator = isPotong ? '+' : '-';
  
      // 4. Eksekusi Upsert (Hanya menargetkan kolomUpdate, biarkan poin_akhir dihitung otomatis oleh Turso)
      await turso.execute({
        sql: `
          INSERT INTO saldo_mutu (sdm_id, bulan, tahun, poin_awal, ${kolomUpdate})
          VALUES (?, ?, ?, 400, ?)
          ON CONFLICT(sdm_id, bulan, tahun) DO UPDATE SET
          ${kolomUpdate} = MAX(0, ${kolomUpdate} ${sqlOperator} ?),
          updated_at = CURRENT_TIMESTAMP
        `,
        args: [sdm_id, bulan, tahun, nominal, nominal]
      });
  
      return NextResponse.json({ success: true, message: "Eksekusi poin mutu berhasil dicatat ke sistem!" });
  
    } catch (error) {
      console.error("ERROR API POST PENGADILAN MUTU:", error);
      return NextResponse.json({ success: false, error: "Gagal mengeksekusi pengadilan mutu." }, { status: 500 });
    }
}