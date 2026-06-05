import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// ====================================================================
// 1. FUNGSI GET (Mengambil Data Dokter - ISOLASI KETAT PER RUANGAN)
// ====================================================================
export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userData = JSON.parse(session.value);
    const userRuangan = userData.ruangan || "POLIKLINIK";

    // PERBAIKAN: Kunci query hanya untuk ruangan yang sesuai dengan user yang login
    const result = await turso.execute({
      sql: `
        SELECT * FROM master_dokter 
        WHERE ruangan = ? 
        ORDER BY simbol_praktik ASC, nama_dokter ASC
      `,
      args: [userRuangan.toUpperCase()]
    });

    return NextResponse.json(result.rows);
    
  } catch (error) {
    console.error("Gagal ambil data dokter:", error);
    
    return NextResponse.json(
      { 
        error: "Gagal memuat data dokter.", 
        detail: error.message 
      }, 
      { status: 500 }
    );
  }
}

// ====================================================================
// 2. FUNGSI PATCH (Menyimpan & Mengunci Jumlah Pasien - DENGAN PROTEKSI LOGIN)
// ====================================================================
export async function PATCH(request) {
  try {
    // PERBAIKAN KEAMANAN: Validasi sesi cookie sebelum memproses data pasien
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");

    if (!session) {
      return NextResponse.json({ error: "Akses ditolak. Silakan login terlebih dahulu." }, { status: 401 });
    }

    const body = await request.json();
    const { nama_dokter, klinik, tanggal, bulan, tahun, jumlah } = body;

    if (!nama_dokter || !klinik || !tanggal || !bulan || !tahun) {
      return NextResponse.json({ error: "Data parameter input tidak lengkap." }, { status: 400 });
    }

    // FITUR ANTI-ERROR: Bersihkan spasi berlebih dengan TRIM dan UPPERCASE 
    const cleanNama = nama_dokter.trim().toUpperCase();
    const cleanKlinik = klinik.trim().toUpperCase();

    // Cek apakah hari ini dokter tersebut sudah ada datanya di tabel jumlah_pasien_poli
    const check = await turso.execute({
      sql: `SELECT id FROM jumlah_pasien_poli 
            WHERE TRIM(UPPER(nama_dokter)) = ? 
            AND TRIM(UPPER(klinik)) = ? 
            AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [cleanNama, cleanKlinik, tanggal, bulan, tahun]
    });

    if (check.rows.length > 0) {
      // Jika sudah ada, UPDATE (Timpa) datanya dengan jumlah yang baru
      await turso.execute({
        sql: `UPDATE jumlah_pasien_poli SET jumlah = ? WHERE id = ?`,
        args: [jumlah, check.rows[0].id]
      });
    } else {
      // Jika belum ada, INSERT (Masukkan) data baru
      await turso.execute({
        sql: `INSERT INTO jumlah_pasien_poli (nama_dokter, klinik, tanggal, bulan, tahun, jumlah) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [cleanNama, cleanKlinik, tanggal, bulan, tahun, jumlah]
      });
    }

    return NextResponse.json({ success: true, message: "Data berhasil dikunci dan disimpan." });
  } catch (e) {
    console.error("Gagal PATCH Jadwal:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}