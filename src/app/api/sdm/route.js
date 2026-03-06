import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Ambil data ruangan dari Sesi (Cookie)
    let userRuangan = "";
    try {
      const userData = JSON.parse(session.value);
      userRuangan = userData.ruangan;
    } catch (e) {
      // Jika cookie masih format lama (tulisan "active"), beri default
      userRuangan = "POLIKLINIK";
    }

    // 2. PENGGANTI RLS (VERSI AMAN & PENYELAMAT DATA):
    // Kita ambil data yang ruangannya cocok dengan User, 
    // ATAU data yang kolom 'ruangan'-nya masih KOSONG (NULL/String Kosong).
    // Ini kuncinya agar 27 data Bapak yang ada di Turso bisa tampil lagi.
    const result = await turso.execute({
      sql: `
        SELECT * FROM sdm 
        WHERE ruangan = ? 
        OR ruangan IS NULL 
        OR ruangan = '' 
        ORDER BY nama ASC
      `,
      args: [userRuangan]
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Gagal ambil data SDM:", error);
    return NextResponse.json(
      { error: "Gagal memuat data staf" }, 
      { status: 500 }
    );
  }
}