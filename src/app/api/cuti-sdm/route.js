import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Memaksa Next.js agar selalu mengambil data terbaru (Live Sync)
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    // Tambahkan request url untuk menangkap parameter dari Public Link
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
        console.warn("Format cookie lama terdeteksi, menggunakan default POLIKLINIK");
      }
    } else if (paramRuangan) {
      // Jika tidak ada session (akses public), gunakan parameter ruangan
      userRuangan = paramRuangan;
    }

    const kunciRuangan = String(userRuangan).trim().toUpperCase();

    /**
     * PERBAIKAN QUERY (UTUH & DETAIL):
     * - Menarik semua pengajuan: Menunggu, Disetujui, maupun Ditolak.
     * - RLS Tetap Aman: Hanya menampilkan data sesuai ruangan user login/public.
     * - Penyelamat Data: Mengunci pencarian menggunakan UPPER & TRIM.
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
      WHERE UPPER(TRIM(c.ruangan)) = UPPER(TRIM(?))
      GROUP BY c.id
      ORDER BY c.tanggal_input DESC
    `;

    const res = await turso.execute({
      sql: query,
      args: [kunciRuangan]
    });

    return NextResponse.json(res.rows || []);

  } catch (error) {
    console.error("API Cuti SDM Error:", error);
    // Tetap mengembalikan Array Kosong [] jika database bermasalah.
    return NextResponse.json([]);
  }
}