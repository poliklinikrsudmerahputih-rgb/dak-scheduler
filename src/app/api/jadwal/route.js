import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { bulan, tahun, ruangan, dataJadwal } = await req.json();

    // Kita gunakan sistem: Hapus data lama di bulan/tahun/ruangan tsb, lalu masukkan yang baru
    // Agar tidak terjadi duplikasi data
    await turso.execute({
      sql: "DELETE FROM jadwal_dinas WHERE bulan = ? AND tahun = ? AND ruangan = ?",
      args: [bulan, tahun, ruangan]
    });

    // Masukkan data baru satu per satu
    for (const key in dataJadwal) {
      const [sdmId, tanggal] = key.split("-");
      const simbol = dataJadwal[key];

      if (simbol) {
        await turso.execute({
          sql: "INSERT INTO jadwal_dinas (sdm_id, tanggal, bulan, tahun, ruangan, simbol) VALUES (?, ?, ?, ?, ?, ?)",
          args: [sdmId, tanggal, bulan, tahun, ruangan, simbol]
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const bulan = searchParams.get("bulan");
  const tahun = searchParams.get("tahun");
  const ruangan = searchParams.get("ruangan");

  try {
    const res = await turso.execute({
      sql: "SELECT * FROM jadwal_dinas WHERE bulan = ? AND tahun = ? AND ruangan = ?",
      args: [bulan, tahun, ruangan]
    });
    return NextResponse.json(res.rows);
  } catch (error) {
    return NextResponse.json([]);
  }
}