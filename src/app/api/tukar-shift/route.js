import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { sdmA, sdmB, tanggal, bulan, tahun } = await request.json();

    // 1. Ambil data jadwal asli keduanya
    const resA = await turso.execute({
      sql: `SELECT simbol, ruangan FROM jadwal_dinas WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [sdmA, tanggal, bulan, tahun]
    });
    const resB = await turso.execute({
      sql: `SELECT simbol, ruangan FROM jadwal_dinas WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [sdmB, tanggal, bulan, tahun]
    });

    const dataA = resA.rows[0];
    const dataB = resB.rows[0];

    // 2. TUKAR SIMBOL & RUANGAN (Update Silang)
    // Perawat A mengambil jatah Perawat B
    await turso.execute({
      sql: `UPDATE jadwal_dinas SET simbol = ?, ruangan = ? WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [dataB.simbol, dataB.ruangan, sdmA, tanggal, bulan, tahun]
    });

    // Perawat B mengambil jatah Perawat A
    await turso.execute({
      sql: `UPDATE jadwal_dinas SET simbol = ?, ruangan = ? WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [dataA.simbol, dataA.ruangan, sdmB, tanggal, bulan, tahun]
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message });
  }
}