import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

// --- 1. GET: MENGAMBIL DATA JADWAL ---
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
export async function PATCH(req) {
  try {
    const { nama_dokter, klinik, tanggal, bulan, tahun, jumlah } = await req.json();

    // Jalankan operasi DELETE dan INSERT dalam satu batch
    const queries = [
      {
        sql: `DELETE FROM jumlah_pasien_poli WHERE nama_dokter = ? AND klinik = ? AND tanggal = ? AND bulan = ? AND tahun = ?`,
        args: [nama_dokter, klinik, tanggal, bulan, tahun]
      },
      {
        sql: `INSERT INTO jumlah_pasien_poli (nama_dokter, klinik, tanggal, bulan, tahun, jumlah) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [nama_dokter, klinik, tanggal, bulan, tahun, jumlah]
      }
    ];

    await turso.batch(queries, "write");
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

    // 1. Siapkan "keranjang" antrean perintah (queries array)
    const queries = [];

    // 2. Masukkan perintah hapus data lama ke keranjang
    queries.push({
      sql: "DELETE FROM jadwal_dinas WHERE bulan = ? AND tahun = ? AND ruangan = ?",
      args: [bulan, tahun, ruangan]
    });

    // 3. Masukkan SEMUA perintah simpan data baru ke dalam keranjang
    for (const key in dataJadwal) {
      const [sdmId, tanggal] = key.split("-");
      const simbol = dataJadwal[key];

      if (simbol) {
        queries.push({
          sql: "INSERT INTO jadwal_dinas (sdm_id, tanggal, bulan, tahun, ruangan, simbol) VALUES (?, ?, ?, ?, ?, ?)",
          args: [sdmId, tanggal, bulan, tahun, ruangan, simbol]
        });
      }
    }

    // 4. Eksekusi semua perintah dalam keranjang HANYA 1 KALI JALAN (Batch)
    await turso.batch(queries, "write");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}