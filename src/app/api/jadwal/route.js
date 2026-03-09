import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

// --- 1. GET: MENGAMBIL DATA JADWAL (TETAP SAMA) ---
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
    console.error("GET Error:", error);
    return NextResponse.json([]);
  }
}

// --- 2. PATCH: PENYIMPANAN MANDIRI KE TABEL jumlah_pasien_poli ---
// Revisi: Sekarang menyimpan berdasarkan kombinasi Dokter + Poli
export async function PATCH(req) {
  try {
    const { nama_dokter, klinik, tanggal, bulan, tahun, jumlah } = await req.json();

    // A. Hapus data lama yang spesifik untuk dokter & poli ini di hari tersebut
    // Agar jika Bapak melakukan edit (koreksi), data tidak menumpuk
    await turso.execute({
      sql: `DELETE FROM jumlah_pasien_poli 
            WHERE nama_dokter = ? AND klinik = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [nama_dokter, klinik, tanggal, bulan, tahun]
    });

    // B. Masukkan data jumlah pasien yang baru (Mandiri)
    // Sekarang Dokter Kadek dan Dokter Mutiah akan punya baris datanya masing-masing
    await turso.execute({
      sql: `INSERT INTO jumlah_pasien_poli (nama_dokter, klinik, tanggal, bulan, tahun, jumlah) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [nama_dokter, klinik, tanggal, bulan, tahun, jumlah]
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH Error Spesifik Poli:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- 3. POST: SIMPAN JADWAL MASSAL (UNTUK HALAMAN BUAT JADWAL) ---
export async function POST(req) {
  try {
    const { bulan, tahun, ruangan, dataJadwal } = await req.json();

    await turso.execute({
      sql: "DELETE FROM jadwal_dinas WHERE bulan = ? AND tahun = ? AND ruangan = ?",
      args: [bulan, tahun, ruangan]
    });

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
    console.error("POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}