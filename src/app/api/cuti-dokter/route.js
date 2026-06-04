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
     * - Menggunakan TRIM() dan UPPER() pada pencocokan nama dokter di LEFT JOIN
     * - Menggunakan TRIM() pada field tanggal agar aman dari spasi tersembunyi
     * - Memastikan filter ruangan juga kebal terhadap perbedaan huruf besar/kecil
     */
    const query = `
      SELECT 
        c.id,
        TRIM(c.nama_dokter) as nama_dokter,
        c.jenis_cuti,
        TRIM(c.tgl_mulai) as tgl_mulai,
        TRIM(c.tgl_selesai) as tgl_selesai,
        c.tanggal_input,
        c.simbol,
        d.klinik
      FROM cuti_dokter c
      LEFT JOIN master_dokter d ON TRIM(UPPER(c.nama_dokter)) = TRIM(UPPER(d.nama_dokter))
      WHERE TRIM(UPPER(c.ruangan)) = TRIM(UPPER(?)) 
      OR c.ruangan IS NULL 
      OR c.ruangan = ''
      GROUP BY c.id -- Menghindari duplikat jika dokter punya banyak jadwal praktik
      ORDER BY date(TRIM(c.tgl_mulai)) DESC
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