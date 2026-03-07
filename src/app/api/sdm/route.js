import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// PENTING: Memaksa Next.js agar selalu mengambil data terbaru dari Turso (Bukan Cache)
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    // Proteksi Sesi Login
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Parameter Filter Waktu (Bulan & Tahun) dari Frontend MasterSDM
    const bulan = parseInt(searchParams.get("bulan")) || (new Date().getMonth() + 1);
    const tahun = parseInt(searchParams.get("tahun")) || new Date().getFullYear();

    // 2. Identifikasi Ruangan User untuk Keamanan Data (Fitur Utama)
    let userRuangan = "POLIKLINIK"; 
    try {
      const userData = JSON.parse(session.value);
      userRuangan = userData.ruangan || "POLIKLINIK";
    } catch (e) {
      console.warn("Format cookie lama terdeteksi, menggunakan default POLIKLINIK");
    }

    /**
     * 3. QUERY MASTER SDM & DETAIL ANALYTICS:
     * - s.* : Mengambil semua profil SDM (Nama, NIP, WA, dll).
     * - SUM(j.jumlah_pasien) : Akumulasi total pasien yang diinput bulan tersebut.
     * - GROUP_CONCAT(DISTINCT j.simbol) : Menggabungkan kode klinik unik (Poli Mata, Poli Dalam, dll).
     * - LEFT JOIN : Menampilkan staf meskipun mereka belum ada jadwal/input pasien bulan ini.
     * - WHERE Clause : Membatasi data hanya sesuai Ruangan User (Fitur Keamanan Bapak).
     */
    const result = await turso.execute({
      sql: `
        SELECT 
          s.*, 
          COALESCE(SUM(j.jumlah_pasien), 0) as total_pasien,
          GROUP_CONCAT(DISTINCT j.simbol) as daftar_klinik
        FROM sdm s
        LEFT JOIN jadwal_dinas j ON s.id = j.sdm_id 
          AND j.bulan = ? 
          AND j.tahun = ?
        WHERE (s.ruangan = ? OR s.ruangan IS NULL OR s.ruangan = '')
        GROUP BY s.id
        ORDER BY s.nama ASC
      `,
      args: [bulan, tahun, userRuangan]
    });

    /**
     * Mengembalikan array objek utuh yang sekarang berisi field 'daftar_klinik'
     * Contoh isi daftar_klinik: "MAT, DAL, ANAK"
     */
    return NextResponse.json(result.rows || []);

  } catch (error) {
    console.error("CRITICAL ERROR API SDM:", error);
    // Mengembalikan array kosong [] agar frontend .map() tidak crash jika db error
    return NextResponse.json([], { status: 500 });
  }
}