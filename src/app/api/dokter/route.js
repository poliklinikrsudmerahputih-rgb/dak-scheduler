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

    const userData = JSON.parse(session.value);
    const userRuangan = userData.ruangan || "POLIKLINIK";

    // PERBAIKAN: ORDER BY nama_dokter (sesuai kolom di Turso Bapak)
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

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Gagal ambil data dokter:", error);
    return NextResponse.json(
      { error: "Gagal memuat data dokter. Periksa kolom nama_dokter!" }, 
      { status: 500 }
    );
  }
}