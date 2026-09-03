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
    // Tangkap jalur public dari ViewJadwalPublic
    const isPublic = new URL(req.url).searchParams.get("isPublic") === "true";

    if (!userRuangan && !isPublic) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const bulan = searchParams.get("bulan");
    const tahun = searchParams.get("tahun");

    // Jika masuk dari jalur publik, gunakan ruangan dari parameter, jika tidak ada default ke POLIKLINIK
    const paramRuangan = searchParams.get("ruangan");
    const ruanganTarget = userRuangan || (paramRuangan ? paramRuangan.toUpperCase() : "POLIKLINIK");

    // Join with `sdm` to include nama/jabatan/is_aktif so the frontend can
    // render historical names even if the SDM is no longer active.
    const res = await turso.execute({
      sql: `SELECT j.*, s.nama AS sdm_nama, s.jabatan AS sdm_jabatan, s.is_aktif AS sdm_is_aktif, s.ruangan_aktif AS sdm_ruangan_aktif
            FROM jadwal_dinas j
            LEFT JOIN sdm s ON s.id = j.sdm_id
            WHERE j.bulan = ? AND j.tahun = ? AND UPPER(TRIM(j.ruangan)) = ?`,
      args: [bulan, tahun, ruanganTarget]
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
    // 1. Tangkap "Kunci Bypass" dari ViewJadwalPublic
    const isPublic = req.headers.get("x-public-access") === "true" || new URL(req.url).searchParams.get("isPublic") === "true";
    const userRuangan = await getSessionRuangan();
    
    // 2. Jika tidak ada sesi DAN bukan dari jalur publik, baru ditolak
    if (!userRuangan && !isPublic) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    // Basic validation + normalization
    let { nama_dokter, klinik, tanggal, bulan, tahun, jumlah } = body || {};
    nama_dokter = String(nama_dokter || '').trim();
    klinik = String(klinik || '').trim();
    tanggal = String(tanggal || '').trim();
    bulan = String(bulan || '').trim();
    tahun = String(tahun || '').trim();
    jumlah = Number(jumlah || 0);

    console.log('[PATCH /api/jadwal] incoming:', { nama_dokter, klinik, tanggal, bulan, tahun, jumlah, isPublic });

    if (!nama_dokter || !klinik || !tanggal || !bulan || !tahun) {
      return NextResponse.json({ error: 'Invalid payload: missing required fields' }, { status: 400 });
    }

    // Use an UPSERT-like approach (SELECT -> UPDATE or INSERT)
    const check = await turso.execute({
      sql: `SELECT id FROM jumlah_pasien_poli WHERE TRIM(LOWER(nama_dokter)) = TRIM(LOWER(?)) AND TRIM(LOWER(klinik)) = TRIM(LOWER(?)) AND tanggal = ? AND bulan = ? AND tahun = ?`,
      args: [nama_dokter, klinik, tanggal, bulan, tahun]
    });

    if (check.rows && check.rows.length > 0) {
      await turso.execute({
        sql: `UPDATE jumlah_pasien_poli SET jumlah = ? WHERE TRIM(LOWER(nama_dokter)) = TRIM(LOWER(?)) AND TRIM(LOWER(klinik)) = TRIM(LOWER(?)) AND tanggal = ? AND bulan = ? AND tahun = ?`,
        args: [jumlah, nama_dokter, klinik, tanggal, bulan, tahun]
      });
    } else {
      await turso.execute({
        sql: `INSERT INTO jumlah_pasien_poli (nama_dokter, klinik, tanggal, bulan, tahun, jumlah) VALUES (?, ?, ?, ?, ?, ?)` ,
        args: [nama_dokter, klinik, tanggal, bulan, tahun, jumlah]
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH Error Spesifik Poli:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- 3. POST: SIMPAN JADWAL MASSAL (TERISOLASI) ---
export async function POST(req) {
  try {
    // Untuk POST (Simpan Jadwal Massal sebulan) kita biarkan KETAT, hanya Karu yang login yang boleh.
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