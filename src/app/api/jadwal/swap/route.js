import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req) {
  try {
    // 1. ISOLASI KEAMANAN (RLS): Baca Sesi Karu dari Cookie
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized: Silakan login terlebih dahulu." }, { status: 401 });
    }

    let userRuangan = "POLIKLINIK";
    try {
      const userData = JSON.parse(session.value);
      userRuangan = userData.ruangan || "POLIKLINIK";
    } catch (e) {
      console.warn("Format cookie lama terdeteksi");
    }

    const kunciRuangan = userRuangan.toUpperCase();

    // 2. Tangkap parameter request Swap
    const { sdmA, sdmB, tanggal, bulan, tahun } = await req.json();

    // 3. AMBIL DATA LENGKAP PERAWAT A (Dibatasi hanya untuk ruangan Karu)
    const resA = await turso.execute({
      sql: "SELECT simbol, jumlah_pasien FROM jadwal_dinas WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ? AND UPPER(TRIM(ruangan)) = ?",
      args: [sdmA, tanggal, bulan, tahun, kunciRuangan]
    });

    // 4. AMBIL DATA LENGKAP PERAWAT B (Dibatasi hanya untuk ruangan Karu)
    const resB = await turso.execute({
      sql: "SELECT simbol, jumlah_pasien FROM jadwal_dinas WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ? AND UPPER(TRIM(ruangan)) = ?",
      args: [sdmB, tanggal, bulan, tahun, kunciRuangan]
    });

    const dataA = resA.rows[0];
    const dataB = resB.rows[0];

    // Validasi Ekstra: Tolak jika jadwal tidak ditemukan ATAU jika perawat tersebut milik ruangan lain
    if (!dataA || !dataB) {
      return NextResponse.json({ 
        error: "Gagal Swap: Salah satu perawat tidak memiliki jadwal pada tanggal tersebut atau perawat berasal dari ruangan lain." 
      }, { status: 404 });
    }

    /**
     * 5. EKSEKUSI TUKAR TOTAL (SWAP)
     * Swap dieksekusi dengan tetap memastikan kunci ruangan untuk menghindari manipulasi data antar-unit.
     */
    
    // Perawat A mengambil Simbol dan Jumlah Pasien milik B
    await turso.execute({
      sql: `UPDATE jadwal_dinas 
            SET simbol = ?, jumlah_pasien = ? 
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [dataB.simbol, dataB.jumlah_pasien, sdmA, tanggal, bulan, tahun, kunciRuangan]
    });

    // Perawat B mengambil Simbol dan Jumlah Pasien milik A
    await turso.execute({
      sql: `UPDATE jadwal_dinas 
            SET simbol = ?, jumlah_pasien = ? 
            WHERE sdm_id = ? AND tanggal = ? AND bulan = ? AND tahun = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [dataA.simbol, dataA.jumlah_pasien, sdmB, tanggal, bulan, tahun, kunciRuangan]
    });

    return NextResponse.json({ 
      success: true, 
      message: "Berhasil menukar posisi tugas dan beban pasien di unit " + kunciRuangan + "." 
    });

  } catch (error) {
    console.error("Swap API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}