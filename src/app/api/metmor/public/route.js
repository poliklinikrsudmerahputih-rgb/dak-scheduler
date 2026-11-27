import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const token = String(searchParams.get("token") || "").trim();
    if (token) {
      const result = await turso.execute({
        sql: `SELECT tanggal, informasi, ruangan
              FROM metmor WHERE public_token = ? LIMIT 1`,
        args: [token],
      });
      if (!result.rows.length) return NextResponse.json({ error: "Tautan Metmor tidak ditemukan." }, { status: 404 });
      return NextResponse.json({ success: true, data: result.rows[0] });
    }

    const tanggal = String(searchParams.get("tanggal") || "").trim();
    const ruangan = String(searchParams.get("ruangan") || "POLIKLINIK").trim().toUpperCase();
    if (!ruangan) {
      return NextResponse.json({ error: "Ruangan tidak valid." }, { status: 400 });
    }

    if (searchParams.get("history") === "true") {
      const history = await turso.execute({
        sql: `SELECT id, tanggal, informasi, ruangan
              FROM metmor
              WHERE UPPER(TRIM(ruangan)) = ?
              ORDER BY tanggal DESC, id DESC
              LIMIT 200`,
        args: [ruangan],
      });
      return NextResponse.json({ success: true, data: history.rows });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
    }
    const result = await turso.execute({
      sql: `SELECT tanggal, informasi, ruangan
            FROM metmor
            WHERE tanggal = ? AND UPPER(TRIM(ruangan)) = ?
            ORDER BY id DESC`,
      args: [tanggal, ruangan],
    });
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Gagal mengambil Metmor publik:", error);
    return NextResponse.json({ success: false, error: "Gagal mengambil informasi Metmor." }, { status: 500 });
  }
}
