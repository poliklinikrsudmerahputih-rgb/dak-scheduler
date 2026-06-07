import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

// =====================================================================
// FUNGSI GET: Mengambil data untuk Counter Sampel & Live Analisis
// =====================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    // MODE 1: Mengambil nomor kejadian terakhir perawat (Untuk Stopwatch)
    if (mode === "count") {
      const sdm_id = searchParams.get("sdm_id");
      if (!sdm_id) return NextResponse.json({ last_count: 0 });

      const res = await turso.execute({
        sql: `SELECT MAX(no_kejadian) as last_count FROM log_observasi_kerja WHERE sdm_id = ?`,
        args: [sdm_id]
      });
      return NextResponse.json({ last_count: res.rows[0].last_count || 0 });
    }

    // MODE 2: Mengambil Live Analisis Rata-Rata Waktu per Poli (Untuk Modal Analisis)
    if (mode === "analisis") {
      const res = await turso.execute(`
        SELECT 
          ruangan, 
          blok_kategori,
          COUNT(*) as jumlah_sampel,
          ROUND(AVG(durasi_menit), 2) as rata_rata_menit
        FROM log_observasi_kerja
        GROUP BY ruangan, blok_kategori
        ORDER BY ruangan ASC, blok_kategori ASC
      `);
      return NextResponse.json({ data: res.rows });
    }

    return NextResponse.json({ error: "Parameter mode tidak valid" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =====================================================================
// FUNGSI POST: Menyimpan data observasi (Stopwatch) ke database
// =====================================================================
export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      sdm_id, 
      ruangan, 
      blok_kategori, 
      detail_tindakan, 
      waktu_mulai, 
      waktu_selesai, 
      durasi_menit,
      no_kejadian 
    } = body;

    // 1. Validasi Paling Dasar: Wajib ada ID SDM
    if (!sdm_id) {
      return NextResponse.json({ error: "Gagal: ID Perawat tidak ditemukan" }, { status: 400 });
    }

    // 2. Nilai Fallback (Cadangan) agar terhindar dari Error "Data Tidak Lengkap"
    const safeRuangan = ruangan ? ruangan.toUpperCase() : "POLIKLINIK UMUM";
    const safeKategori = blok_kategori ? blok_kategori.toUpperCase() : "UMUM";
    const safeTindakan = detail_tindakan ? detail_tindakan : "-";
    const safeMulai = waktu_mulai || new Date().toLocaleTimeString('id-ID');
    const safeSelesai = waktu_selesai || new Date().toLocaleTimeString('id-ID');
    
    // Pastikan durasi bernilai desimal yang valid (tidak 0 atau NaN)
    const durasiValid = parseFloat(durasi_menit);
    const safeDurasi = (durasiValid > 0) ? durasiValid : 0.1; 
    
    const safeKejadian = parseInt(no_kejadian) || 1;

    // 3. Eksekusi Insert ke Turso
    await turso.execute({
      sql: `INSERT INTO log_observasi_kerja 
            (sdm_id, ruangan, tanggal_input, blok_kategori, detail_tindakan, waktu_mulai, waktu_selesai, durasi_menit, no_kejadian) 
            VALUES (?, ?, date('now', '+7 hours'), ?, ?, ?, ?, ?, ?)`,
      args: [
        sdm_id, 
        safeRuangan, 
        safeKategori, 
        safeTindakan, 
        safeMulai, 
        safeSelesai, 
        Math.round(safeDurasi * 100) / 100, // Menyimpan 2 angka di belakang koma (misal: 4.56 menit)
        safeKejadian
      ]
    });

    return NextResponse.json({ success: true, message: `Kejadian / Sampel #${safeKejadian} tersimpan.` });
  } catch (error) {
    console.error("Observasi API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}