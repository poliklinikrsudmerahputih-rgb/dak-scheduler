import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request) {
  try {
    // 1. ISOLASI KEAMANAN: Cek Sesi Karu yang Sedang Login
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    if (!session) {
      return NextResponse.json({ 
        success: false, 
        error: "Akses ditolak: Sesi Anda telah habis." 
      }, { status: 401 });
    }

    let userRuangan = "POLIKLINIK";
    try {
      const userData = JSON.parse(session.value);
      userRuangan = userData.ruangan ? userData.ruangan.toUpperCase() : "POLIKLINIK";
    } catch (e) {
      console.warn("Format cookie lama terdeteksi");
    }

    const { sdmA, sdmB, tanggal, bulan, tahun } = await request.json();

    // 2. AMBIL DATA JADWAL ASLI (Difilter Ketat Berdasarkan Ruangan Karu)
    const resA = await turso.execute({
      sql: `SELECT simbol, ruangan FROM jadwal_dinas 
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ? 
            AND UPPER(TRIM(ruangan)) = ?`,
      args: [sdmA, tanggal, bulan, tahun, userRuangan]
    });
    const resB = await turso.execute({
      sql: `SELECT simbol, ruangan FROM jadwal_dinas 
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ? 
            AND UPPER(TRIM(ruangan)) = ?`,
      args: [sdmB, tanggal, bulan, tahun, userRuangan]
    });

    const dataA = resA.rows[0];
    const dataB = resB.rows[0];

    // Validasi Ekstra: Tolak jika jadwal tidak ditemukan di ruangan Karu tersebut
    if (!dataA || !dataB) {
      return NextResponse.json({ 
        success: false, 
        error: "Gagal: Salah satu perawat tidak memiliki jadwal di unit Anda pada tanggal tersebut." 
      }, { status: 404 });
    }

    // 3. TUKAR SIMBOL & RUANGAN (Update Silang Terkunci)
    // Perawat A mengambil jatah Perawat B
    await turso.execute({
      sql: `UPDATE jadwal_dinas 
            SET simbol = ?, ruangan = ? 
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ? 
            AND UPPER(TRIM(ruangan)) = ?`,
      args: [dataB.simbol, dataB.ruangan, sdmA, tanggal, bulan, tahun, userRuangan]
    });

    // Perawat B mengambil jatah Perawat A
    await turso.execute({
      sql: `UPDATE jadwal_dinas 
            SET simbol = ?, ruangan = ? 
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ? 
            AND UPPER(TRIM(ruangan)) = ?`,
      args: [dataA.simbol, dataA.ruangan, sdmB, tanggal, bulan, tahun, userRuangan]
    });

    return NextResponse.json({ 
      success: true,
      message: `Shift berhasil ditukar untuk unit ${userRuangan}`
    });
  } catch (error) {
    console.error("Swap Shift API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}