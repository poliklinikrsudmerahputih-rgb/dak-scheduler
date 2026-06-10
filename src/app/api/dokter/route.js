import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Memaksa Next.js mengambil data secara real-time (Bypass Cache)
export const dynamic = "force-dynamic";

// ====================================================================
// FUNGSI GET (Mengambil Data Master Dokter untuk Tabel Monitor)
// ====================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 1. ISOLASI KEAMANAN (RLS) SESI RUANGAN
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    
    let userRuangan = "POLIKLINIK"; 
    const paramRuangan = searchParams.get("ruangan");

    if (session) {
      try {
        const userData = JSON.parse(session.value);
        userRuangan = userData.ruangan || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama terdeteksi");
      }
    } else if (paramRuangan) {
      userRuangan = paramRuangan;
    }

    const kunciRuangan = String(userRuangan).trim().toUpperCase();

    // 2. EKSEKUSI QUERY KE TURSO
    // Filter dilonggarkan: Mengambil seluruh dokter, lalu diurutkan dari yang terbaru.
    // Jika suatu saat Bapak ingin membatasi hanya dokter di "POLIKLINIK" yang muncul, 
    // cukup ubah menjadi: SELECT * FROM master_dokter WHERE UPPER(TRIM(ruangan)) = ?
    const result = await turso.execute({
      sql: `
        SELECT 
          id,
          nama_dokter, 
          klinik, 
          jadwal_hari, 
          jam_praktik, 
          simbol_praktik,
          ruangan
        FROM master_dokter 
        ORDER BY id DESC
      `,
      args: [] 
    });

    // 3. KEMBALIKAN DATA KE FRONTEND
    return NextResponse.json(result.rows || []);
    
  } catch (error) {
    console.error("Gagal mengambil data master dokter:", error);
    // Kembalikan array kosong agar map() di MasterDokter.js tidak error/crash
    return NextResponse.json([]); 
  }
}

// Catatan: Fungsi POST, PUT, dan DELETE tidak diletakkan di sini 
// karena sistem Bapak sudah menggunakan Server Actions (actions.js) 
// untuk manajemen datanya.