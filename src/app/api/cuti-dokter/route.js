import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Ambil Sesi Login untuk RLS
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    if (!session) return NextResponse.json([]);

    const userData = JSON.parse(session.value);
    const userRuangan = userData.ruangan || "POLIKLINIK";

    /**
     * PERBAIKAN QUERY:
     * - Mengganti 'dokter' menjadi 'master_dokter'
     * - Mengganti 'd.nama' menjadi 'd.nama_dokter'
     * - Menambahkan filter Ruangan agar data muncul sesuai unit
     */
    const query = `
      SELECT 
        c.id,
        c.nama_dokter,
        c.jenis_cuti,
        c.tgl_mulai,
        c.tgl_selesai,
        c.tanggal_input,
        c.simbol,
        d.klinik
      FROM cuti_dokter c
      LEFT JOIN master_dokter d ON c.nama_dokter = d.nama_dokter
      WHERE c.ruangan = ? 
      OR c.ruangan IS NULL 
      OR c.ruangan = ''
      GROUP BY c.id -- Menghindari duplikat jika dokter punya banyak jadwal praktik
      ORDER BY c.tgl_mulai DESC
    `;

    const res = await turso.execute({
      sql: query,
      args: [userRuangan]
    });

    // Kirim data dalam bentuk Array
    return NextResponse.json(res.rows || []);

  } catch (error) {
    console.error("API Cuti Dokter Error:", error);
    // Kirim array kosong jika error agar frontend tidak crash (.map error)
    return NextResponse.json([]);
  }
}