import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { sdm_id, tanggal, bulan, tahun, jumlah } = body;

    // 1. Validasi input lebih ketat
    if (!sdm_id || !tanggal || !bulan || !tahun || jumlah === undefined) {
      return NextResponse.json({ error: "Data parameter tidak lengkap" }, { status: 400 });
    }

    const jmlPasien = parseInt(jumlah);
    if (isNaN(jmlPasien) || jmlPasien < 0) {
      return NextResponse.json({ error: "Jumlah pasien harus angka positif" }, { status: 400 });
    }

    // 2. Eksekusi Update ke Turso (Pastikan nama tabel sesuai: jadwal_dinas)
    const result = await turso.execute({
      sql: `UPDATE jadwal_dinas 
            SET jumlah_pasien = ? 
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [jmlPasien, sdm_id, tanggal, bulan, tahun]
    });

    // 3. Logika Response
    if (result.rowsAffected > 0) {
      return NextResponse.json({ 
        success: true, 
        message: `Berhasil mencatat ${jmlPasien} pasien.` 
      });
    } else {
      // Jika baris tidak ditemukan, kemungkinan perawat belum ada jadwal di tanggal tersebut
      return NextResponse.json({ 
        error: "Gagal: Jadwal asisten tidak ditemukan di database untuk tanggal ini." 
      }, { status: 404 });
    }

  } catch (error) {
    console.error("Critical Error Update Pasien:", error);
    return NextResponse.json({ error: "Server Error: " + error.message }, { status: 500 });
  }
}