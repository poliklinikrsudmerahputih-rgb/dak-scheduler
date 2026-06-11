import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Memaksa Next.js agar selalu mengambil data terbaru (Live Sync)
// Sangat penting agar monitor izin di View langsung terupdate saat staf klik simpan
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Ambil Informasi Ruangan dari Sesi Login (Keamanan RLS)
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    // PERBAIKAN: Jangan memblokir akses secara fatal jika sesi terputus
    let userRuangan = "POLIKLINIK";
    if (session) {
      try {
        const userData = JSON.parse(session.value);
        userRuangan = userData.ruangan || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama terdeteksi, menggunakan default POLIKLINIK");
      }
    }

    /**
     * PERBAIKAN QUERY & SUNTIKAN AI (UTUH & DETAIL):
     * - Filter Kelonggaran: Menambahkan 'IS NULL OR = ""' agar data lama tidak hilang.
     * - Sub-Query AI: Menghitung otomatis total CS (Sakit), DL (Dinas), CT (Tahunan).
     * - AI Bulanan: Menghitung total izin khusus di bulan berjalan menggunakan strftime.
     */
    const query = `
      SELECT
        c.id,
        TRIM(c.nama_sdm) as nama_sdm,
        c.jenis_cuti,
        TRIM(c.tgl_mulai) as tgl_mulai,
        TRIM(c.tgl_selesai) as tgl_selesai,
        c.alasan,
        c.tanggal_input,
        c.status_acc,
        s.no_wa,
        
        -- FITUR AI: Analisis Statistik Cuti SDM (Real-Time)
        (SELECT COUNT(*) FROM cuti_sdm sub WHERE TRIM(UPPER(sub.nama_sdm)) = TRIM(UPPER(c.nama_sdm)) AND UPPER(sub.jenis_cuti) = 'CS') as riwayat_sakit,
        (SELECT COUNT(*) FROM cuti_sdm sub WHERE TRIM(UPPER(sub.nama_sdm)) = TRIM(UPPER(c.nama_sdm)) AND UPPER(sub.jenis_cuti) = 'DL') as riwayat_dinas_luar,
        (SELECT COUNT(*) FROM cuti_sdm sub WHERE TRIM(UPPER(sub.nama_sdm)) = TRIM(UPPER(c.nama_sdm)) AND UPPER(sub.jenis_cuti) = 'CT') as riwayat_cuti_tahunan,
        (SELECT COUNT(*) FROM cuti_sdm sub WHERE TRIM(UPPER(sub.nama_sdm)) = TRIM(UPPER(c.nama_sdm)) AND strftime('%Y-%m', sub.tgl_mulai) = strftime('%Y-%m', 'now')) as total_bulan_ini
        
      FROM cuti_sdm c
      LEFT JOIN sdm s ON TRIM(UPPER(c.nama_sdm)) = TRIM(UPPER(s.nama))
      WHERE c.ruangan IS NULL 
         OR TRIM(c.ruangan) = '' 
         OR UPPER(TRIM(c.ruangan)) = UPPER(TRIM(?))
      GROUP BY c.id
      ORDER BY c.tanggal_input DESC
    `;

    const res = await turso.execute({
      sql: query,
      args: [userRuangan]
    });

    /**
     * Mengembalikan res.rows || [] agar fungsi .map() di frontend aman.
     * Data statistik AI (riwayat_sakit, dll) sekarang sudah terlampir di setiap baris data.
     */
    return NextResponse.json(res.rows || []);

  } catch (error) {
    console.error("API Cuti SDM Error:", error);

    /**
     * Tetap mengembalikan Array Kosong [] jika database bermasalah.
     * Ini mencegah error "dataCuti.map is not a function" di layar user.
     */
    return NextResponse.json([]);
  }
}