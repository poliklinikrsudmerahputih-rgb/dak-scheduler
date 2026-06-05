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

    let userRuangan = "POLIKLINIK";
    try {
      const userData = JSON.parse(session.value);
      userRuangan = userData.ruangan || "POLIKLINIK";
    } catch (e) {
      console.warn("Format cookie lama terdeteksi");
    }

    /**
     * PERBAIKAN KETAT QUERY:
     * - Menghapus klausa longgar (OR IS NULL / OR = '') untuk mengunci isolasi per ruangan.
     * - Fungsi TRIM() dan UPPER() tetap dipertahankan untuk membersihkan spasi tersembunyi
     * serta menghindari duplikasi akibat salah ketik kapitalisasi nama dokter.
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
      GROUP BY c.id
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