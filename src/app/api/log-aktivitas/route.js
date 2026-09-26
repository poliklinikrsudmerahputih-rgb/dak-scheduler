import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getSessionRuangan() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session_dak_pro");
  if (!session) return null;

  try {
    return JSON.parse(session.value)?.ruangan || null;
  } catch (error) {
    return null;
  }
}

export async function GET(req) {
  try {
    const userRuangan = await getSessionRuangan();
    if (!userRuangan) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    let sql = `SELECT *
            FROM log_aktivitas
            WHERE ruangan IS NULL
               OR TRIM(ruangan) = ''
               OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?))`;
    const args = [userRuangan];

    if (startDate && endDate) {
      sql += ` AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)`;
      args.push(startDate, endDate);
    } else if (startDate) {
      sql += ` AND DATE(created_at) >= DATE(?)`;
      args.push(startDate);
    } else if (endDate) {
      sql += ` AND DATE(created_at) <= DATE(?)`;
      args.push(endDate);
    }

    sql += `\n            ORDER BY created_at DESC\n            LIMIT 100`;

    const result = await turso.execute({ sql, args });

    return NextResponse.json(result.rows || []);
  } catch (error) {
    console.error("GET /api/log-aktivitas error:", error);
    return NextResponse.json({ error: "Gagal memuat log aktivitas" }, { status: 500 });
  }
}
