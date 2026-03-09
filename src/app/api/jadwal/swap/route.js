import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { sdmA, sdmB, tanggal, bulan, tahun } = await req.json();

    // 1. AMBIL DATA LENGKAP PERAWAT A (Simbol & Jumlah Pasien)
    const resA = await turso.execute({
      sql: "SELECT simbol, jumlah_pasien FROM jadwal_dinas WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?",
      args: [sdmA, tanggal, bulan, tahun]
    });

    // 2. AMBIL DATA LENGKAP PERAWAT B (Simbol & Jumlah Pasien)
    const resB = await turso.execute({
      sql: "SELECT simbol, jumlah_pasien FROM jadwal_dinas WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?",
      args: [sdmB, tanggal, bulan, tahun]
    });

    const dataA = resA.rows[0];
    const dataB = resB.rows[0];

    // Validasi jika jadwal tidak ditemukan
    if (!dataA || !dataB) {
      return NextResponse.json({ 
        error: "Gagal Swap: Salah satu perawat tidak memiliki jadwal pada tanggal tersebut!" 
      }, { status: 404 });
    }

    /**
     * 3. EKSEKUSI TUKAR TOTAL (SWAP)
     * Kita menukar Simbol dan Jumlah Pasien agar Master SDM ikut terupdate otomatis.
     */
    
    // Perawat A sekarang mengambil Simbol dan Jumlah Pasien milik B
    await turso.execute({
      sql: `UPDATE jadwal_dinas 
            SET simbol = ?, jumlah_pasien = ? 
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [dataB.simbol, dataB.jumlah_pasien, sdmA, tanggal, bulan, tahun]
    });

    // Perawat B sekarang mengambil Simbol dan Jumlah Pasien milik A
    await turso.execute({
      sql: `UPDATE jadwal_dinas 
            SET simbol = ?, jumlah_pasien = ? 
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [dataA.simbol, dataA.jumlah_pasien, sdmB, tanggal, bulan, tahun]
    });

    return NextResponse.json({ 
      success: true, 
      message: "Berhasil menukar posisi tugas dan beban pasien di database." 
    });

  } catch (error) {
    console.error("Swap API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}