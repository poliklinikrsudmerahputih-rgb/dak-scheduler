import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseSessionValue } from '@/lib/session';

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

    // Identifikasi Ruangan User; jika tidak ada sesi, boleh menggunakan param 'ruangan' (public view)
    let userRuangan = "POLIKLINIK"; 
    const paramRuangan = searchParams.get("ruangan");
    if (session) {
      try {
        const userData = parseSessionValue(session);
        userRuangan = (userData?.ruangan) || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama atau tidak valid");
      }
    } else if (paramRuangan) {
      userRuangan = paramRuangan.toUpperCase();
    }

    // 1. Ambil data dasar SDM + LEFT JOIN ke saldo_mutu agar poin tampil
    // Kita tetap BISA mambaca (SELECT) poin_akhir meskipun dia kolom otomatis
    const resSdm = await turso.execute({
      sql: `SELECT s.*, sm.poin_akhir, sm.total_penalti, hm.last_mutasi
            FROM sdm s
            LEFT JOIN saldo_mutu sm ON s.id = sm.sdm_id AND sm.bulan = ? AND sm.tahun = ?
            LEFT JOIN (
              SELECT sdm_id, MAX(created_at) AS last_mutasi FROM sdm_histori_mutasi GROUP BY sdm_id
            ) hm ON hm.sdm_id = s.id
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
        sql: `SELECT nama_dokter, klinik, simbol_praktik, keterangan_simbol FROM master_dokter 
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
      // Distinguish between pengadilan mutu posts and mutasi actions
      if (body && body.action === 'mutasi') {
        const cookieStore = await cookies();
        const session = cookieStore.get('session_dak_pro');
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userData = parseSessionValue(session) || {};

        const { id, ruangan_aktif, status_kerja, keterangan, tanggal_mulai, tanggal_selesai, jenis_mutasi } = body;
        if (!id) return NextResponse.json({ error: 'sdm id required' }, { status: 400 });

        // Fetch existing SDM
        const existing = await turso.execute({ sql: 'SELECT * FROM sdm WHERE id = ?', args: [id] });
        if (!existing.rows || existing.rows.length === 0) return NextResponse.json({ error: 'SDM not found' }, { status: 404 });
        const old = existing.rows[0];

        // Insert history record
        await turso.execute({
          sql: `INSERT INTO sdm_histori_mutasi (sdm_id, ruangan_lama, ruangan_baru, status_sebelum, status_sesudah, jenis_mutasi, tanggal_mulai, tanggal_selesai, keterangan, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [id, old.ruangan_aktif || old.ruangan || null, ruangan_aktif || null, old.status_kerja || null, status_kerja || null, jenis_mutasi || status_kerja || null, tanggal_mulai || null, tanggal_selesai || null, keterangan || null, userData.id]
        });

        // Update main sdm table
        const now = new Date().toISOString().slice(0,10);
        const isAktif = (status_kerja && (status_kerja === 'RESIGN' || status_kerja === 'NON_AKTIF')) ? 0 : 1;
        await turso.execute({
          sql: `UPDATE sdm SET status_kerja = ?, ruangan_aktif = ?, is_aktif = ?, tanggal_akhir_kerja = CASE WHEN ? IN ('RESIGN','NON_AKTIF') THEN ? ELSE tanggal_akhir_kerja END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [status_kerja || old.status_kerja, ruangan_aktif || old.ruangan_aktif || old.ruangan, isAktif, status_kerja, (status_kerja === 'RESIGN' || status_kerja === 'NON_AKTIF') ? now : null, id]
        });

        // Log activity
        await turso.execute({
          sql: `INSERT INTO log_aktivitas (entity_type, entity_id, action, user_id, user_name, ruangan, old_value, new_value, keterangan)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            'sdm', id, 'MUTASI', userData.id, userData.nama || 'system', old.ruangan_aktif || old.ruangan || null,
            JSON.stringify(old), JSON.stringify({ status_kerja, ruangan_aktif, is_aktif: isAktif }), keterangan || `Mutasi: ${jenis_mutasi || status_kerja}`
          ]
        });

        return NextResponse.json({ success: true });
      }

      // Allow updating tampil_di_jadwal flag from UI (show/hide in Buat Jadwal)
      if (body && body.action === 'set_tampil') {
        const cookieStore = await cookies();
        const session = cookieStore.get('session_dak_pro');
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userData = parseSessionValue(session) || {};
        const { id: sdmId, tampil } = body;
        if (!sdmId) return NextResponse.json({ error: 'sdm id required' }, { status: 400 });

        const val = tampil ? 1 : 0;
        await turso.execute({ sql: 'UPDATE sdm SET tampil_di_jadwal = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', args: [val, sdmId] });
        await turso.execute({ sql: `INSERT INTO log_aktivitas (entity_type, entity_id, action, user_id, user_name, ruangan, old_value, new_value, keterangan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` , args: ['sdm', sdmId, 'SET_TAMPIL', userData.id, userData.nama || 'system', userData.ruangan || null, null, JSON.stringify({ tampil: val }), `Set tampil_di_jadwal=${val}`]});
        return NextResponse.json({ success: true });
      }

      // Fallback: existing pengadilan mutu handling
      const { sdm_id, bulan, tahun, jenis, kategori, nominal, catatan } = body;
      if (!sdm_id || !kategori || nominal === undefined) {
        return NextResponse.json({ error: "Data eksekusi mutu tidak lengkap" }, { status: 400 });
      }

      const isPotong = jenis === 'POTONG';
      const poinLog = isPotong ? nominal : -nominal;
      await turso.execute({
        sql: `INSERT INTO log_pengadilan_mutu (sdm_id, bulan, tahun, kategori_pelanggaran, poin_dipotong, catatan)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [sdm_id, bulan, tahun, kategori, poinLog, catatan || "Dieksekusi via Pengadilan Mutu"]
      });

      let kolomUpdate = "penalti_disiplin";
      if (kategori === "SOP_ETIKA") kolomUpdate = "penalti_sop";
      if (kategori === "ASKEP") kolomUpdate = "penalti_askep";
      const sqlOperator = isPotong ? '+' : '-';

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
      return NextResponse.json({ success: false, error: "Gagal mengeksekusi pengadilan mutus atau mutasi." }, { status: 500 });
    }
}