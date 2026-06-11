import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Memaksa Next.js agar selalu mengambil data terbaru secara Live
export const dynamic = "force-dynamic";

// ====================================================================
// FUNGSI GET (Mengambil Data Cuti Dokter & Otak Analisis AI)
// ====================================================================
export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    
    // 1. Toleransi Sesi: Default ke POLIKLINIK jika sesi terputus sesaat
    let userRuangan = "POLIKLINIK";
    
    if (session) {
      try {
        const userData = JSON.parse(session.value);
        userRuangan = userData.ruangan || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama terdeteksi");
      }
    }

    /**
     * 2. QUERY UTAMA BESERTA OTAK AI:
     * - c.jam_tutup: Menarik data jam batas pendaftaran.
     * - total_cuti: Sub-query AI untuk menganalisis riwayat dokter tersebut.
     * - ORDER BY c.id DESC: Memastikan data yang baru diinput nangkring di No.1.
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
        c.jam_tutup,
        d.klinik,
        (SELECT COUNT(*) FROM cuti_dokter sub_c WHERE TRIM(UPPER(sub_c.nama_dokter)) = TRIM(UPPER(c.nama_dokter))) as total_cuti
      FROM cuti_dokter c
      LEFT JOIN master_dokter d ON TRIM(UPPER(c.nama_dokter)) = TRIM(UPPER(d.nama_dokter))
      WHERE c.ruangan IS NULL 
         OR TRIM(c.ruangan) = '' 
         OR TRIM(UPPER(c.ruangan)) = TRIM(UPPER(?)) 
      GROUP BY c.id
      ORDER BY c.id DESC
    `;

    const res = await turso.execute({
      sql: query,
      args: [userRuangan]
    });

    // Kirim data lengkap ke Frontend (CutiDokter.js)
    return NextResponse.json(res.rows || []);

  } catch (error) {
    console.error("API Cuti Dokter Error:", error);
    // Kirim array kosong jika error agar frontend tidak nge-blank
    return NextResponse.json([]);
  }
}