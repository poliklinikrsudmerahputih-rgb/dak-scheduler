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

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userRuangan = "POLIKLINIK";
    try {
      const userData = JSON.parse(session.value);
      userRuangan = userData.ruangan || "POLIKLINIK";
    } catch (e) {
      console.warn("Format cookie lama terdeteksi, menggunakan default POLIKLINIK");
    }

    /**
     * PERBAIKAN QUERY (UTUH & DETAIL):
     * - Menarik semua pengajuan: Menunggu, Disetujui, maupun Ditolak.
     * - RLS Tetap Aman: Hanya menampilkan data sesuai ruangan user login.
     * - Penyelamat Data: Menampilkan data yang kolom 'ruangan'-nya NULL atau Kosong.
     * - JOIN SDM: Menarik nomor WhatsApp (untuk fitur hubungi staf jika diperlukan).
     * - Sorting: Berdasarkan tanggal_input terbaru agar pengajuan baru langsung muncul di monitor.
     */
    const query = `
      SELECT 
        c.id,
        c.nama_sdm,
        c.jenis_cuti,
        c.tgl_mulai,
        c.tgl_selesai,
        c.alasan,
        c.tanggal_input,
        c.status_acc,
        s.no_wa
      FROM cuti_sdm c
      LEFT JOIN sdm s ON c.nama_sdm = s.nama
      WHERE c.ruangan = ? 
      OR c.ruangan IS NULL 
      OR c.ruangan = ''
      GROUP BY c.id
      ORDER BY c.tanggal_input DESC
    `;

    const res = await turso.execute({
      sql: query,
      args: [userRuangan]
    });

    /**
     * Mengembalikan res.rows || [] agar fungsi .map() di frontend aman.
     * Data ini akan diproses oleh ViewJadwalPublic untuk membedakan warna 
     * antara yang 'Disetujui' (Hijau) dan 'Menunggu' (Amber).
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