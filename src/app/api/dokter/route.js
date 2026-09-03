import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Memaksa Next.js mengambil data secara real-time (Bypass Cache)
export const dynamic = "force-dynamic";

// ====================================================================
// FUNGSI GET (Master Dokter + Fitur AI Deteksi Simbol Kembar + Bobot Jaspel)
// ====================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 1. TANGKAP PARAMETER HARI INI
    // Membuka jalan agar frontend bisa meminta data khusus hari ini saja
    const filterHari = searchParams.get("hari");
    
    // 2. ISOLASI KEAMANAN (RLS) SESI RUANGAN
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

    // 3. EKSEKUSI QUERY DENGAN KECERDASAN BUATAN (AI)
    let sqlQuery = `
      SELECT 
        md.id,
        md.nama_dokter, 
        md.klinik, 
        md.jadwal_hari, 
        md.jam_praktik, 
        md.simbol_praktik,
        md.ruangan,
        
        -- PENAMBAHAN BARU: Menarik data bobot jaspel dari database
        md.bobot_jaspel,
        
        -- FITUR AI: Menghitung berapa banyak simbol unik yang dimiliki dokter ini
        (SELECT COUNT(DISTINCT simbol_praktik) 
         FROM master_dokter sub 
         WHERE UPPER(TRIM(sub.nama_dokter)) = UPPER(TRIM(md.nama_dokter))
        ) as ai_total_simbol,
        
        -- FITUR AI: Menuliskan apa saja simbol yang dimiliki dokter ini
        (SELECT GROUP_CONCAT(DISTINCT simbol_praktik) 
         FROM master_dokter sub 
         WHERE UPPER(TRIM(sub.nama_dokter)) = UPPER(TRIM(md.nama_dokter))
        ) as ai_daftar_simbol
        , md.keterangan_simbol

      FROM master_dokter md
      WHERE 1=1
    `;
    
    let sqlArgs = [];

    if (userRuangan) {
      sqlQuery += ` AND (md.ruangan IS NULL OR TRIM(md.ruangan) = '' OR UPPER(TRIM(md.ruangan)) = UPPER(TRIM(?)))`;
      sqlArgs.push(userRuangan);
    }

    // Jika frontend meminta jadwal khusus hari ini
    if (filterHari) {
      sqlQuery += ` AND UPPER(TRIM(md.jadwal_hari)) = UPPER(TRIM(?))`;
      sqlArgs.push(filterHari);
    }

    // Urutkan data berdasarkan hari dan jam agar tabel lebih rapi
    sqlQuery += ` ORDER BY md.jadwal_hari ASC, md.jam_praktik ASC`;

    const result = await turso.execute({
      sql: sqlQuery,
      args: sqlArgs 
    });

    // 4. KEMBALIKAN DATA KE FRONTEND
    return NextResponse.json(result.rows || []);
    
  } catch (error) {
    console.error("Gagal mengambil data master dokter:", error);
    // Kembalikan array kosong agar map() di MasterDokter.js tidak error/crash
    return NextResponse.json([]); 
  }
}