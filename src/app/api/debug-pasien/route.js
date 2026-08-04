import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
export const dynamic = "force-dynamic";
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const tanggal = url.searchParams.get('tanggal') || new Date().getDate().toString();
    const bulan = url.searchParams.get('bulan') || (new Date().getMonth()+1).toString();
    const tahun = url.searchParams.get('tahun') || new Date().getFullYear().toString();

    const res = await turso.execute({
      sql: `SELECT * FROM jumlah_pasien_poli WHERE tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [String(tanggal), String(bulan), String(tahun)]
    });

    return NextResponse.json({ rows: res.rows });
  } catch (e) {
    console.error('debug-pasien error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
