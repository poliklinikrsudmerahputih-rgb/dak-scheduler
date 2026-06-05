import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Fungsi Validasi Sesi Ruangan Terpusat
async function getSessionRuangan() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session_dak_pro");
  if (!session) return null;

  try {
    const userData = JSON.parse(session.value);
    return userData.ruangan ? userData.ruangan.toUpperCase() : "POLIKLINIK";
  } catch {
    return null;
  }
}

// --- 1. GET: MENGAMBIL DATA JADWAL (TERISOLASI) ---
export async function GET(req) {
  try {
    const userRuangan = await getSessionRuangan();
    if (!userRuangan) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const bulan = searchParams.get("bulan");
    const tahun = searchParams.get("tahun");

    // Ruangan diambil dari sesi, bukan dari parameter luar
    const res = await turso.execute({
      sql: "SELECT * FROM jadwal_dinas WHERE bulan = ? AND tahun = ? AND UPPER(TRIM(ruangan)) = ?",
      args: [bulan, tahun, userRuangan]
    });
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error("GET Error:", error);
    return NextResponse.json([]);
  }
}

// --- 2. PATCH: PENYIMPANAN JUMLAH PASIEN POLI ---
export async function PATCH(req) {
  try {
    const userRuangan = await getSessionRuangan();
    if (!userRuangan) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

// --- 3. POST: SIMPAN JADWAL MASSAL (TERISOLASI) ---
export async function POST(req) {
  try {
    const userRuangan = await getSessionRuangan();
    if (!userRuangan) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { bulan, tahun, dataJadwal } = await req.json();

    const queries = [];

    // Hapus jadwal LAMA secara batch HANYA milik ruangan Karu tersebut
    queries.push({
      sql: "DELETE FROM jadwal_dinas WHERE bulan = ? AND tahun = ? AND UPPER(TRIM(ruangan)) = ?",
      args: [bulan, tahun, userRuangan]
    });

    // Masukkan jadwal BARU dengan stempel ruangan Karu tersebut
    for (const key in dataJadwal) {
      const [sdmId, tanggal] = key.split("-");
      const simbol = dataJadwal[key];

      if (simbol) {
        queries.push({
          sql: "INSERT INTO jadwal_dinas (sdm_id, tanggal, bulan, tahun, ruangan, simbol) VALUES (?, ?, ?, ?, ?, ?)",
          args: [sdmId, tanggal, bulan, tahun, userRuangan, simbol]
        });
      }
    }

    await turso.batch(queries, "write");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}