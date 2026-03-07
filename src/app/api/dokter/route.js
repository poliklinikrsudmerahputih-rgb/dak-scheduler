import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Memaksa agar API selalu mengambil data terbaru dari Database (tidak ambil dari cache browser)
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userData = JSON.parse(session.value);
    const userRuangan = userData.ruangan || "POLIKLINIK";

    /**
     * PENJELASAN QUERY:
     * 1. Filter berdasarkan ruangan user (RLS).
     * 2. Mengakomodasi data lama yang mungkin kolom 'ruangan'-nya masih kosong.
     * 3. Diurutkan secara alfabetis agar tampilan awal di Master Dokter rapi.
     */
    const result = await turso.execute({
      sql: `
        SELECT * FROM master_dokter 
        WHERE ruangan = ? 
        OR ruangan IS NULL 
        OR ruangan = '' 
        ORDER BY nama_dokter ASC
      `,
      args: [userRuangan]
    });

    // Mengembalikan data rows (mentah) ke page.js
    return NextResponse.json(result.rows);
    
  } catch (error) {
    console.error("Gagal ambil data dokter:", error);
    
    // Memberikan pesan error yang lebih spesifik jika terjadi masalah pada tabel Turso
    return NextResponse.json(
      { 
        error: "Gagal memuat data dokter.", 
        detail: error.message 
      }, 
      { status: 500 }
    );
  }
}