import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

// =====================================================================
// FUNGSI GET: Untuk menarik rata-rata skor beban kerja (Opsional untuk Analisis)
// =====================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    if (mode === "analisis") {
      const res = await turso.execute(`
        SELECT 
          COUNT(*) as total_responden,
          ROUND(AVG(mental_demand), 2) as rata_mental,
          ROUND(AVG(physical_demand), 2) as rata_fisik,
          ROUND(AVG(temporal_demand), 2) as rata_waktu,
          ROUND(AVG(performance), 2) as rata_performa,
          ROUND(AVG(effort), 2) as rata_usaha,
          ROUND(AVG(frustration), 2) as rata_frustrasi
        FROM log_nasa_tlx
      `);
      return NextResponse.json({ success: true, data: res.rows[0] });
    }

    return NextResponse.json({ error: "Parameter mode tidak valid" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =====================================================================
// FUNGSI POST: Menyimpan data kuesioner dari Frontend
// =====================================================================
export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      sdm_id, 
      mental, 
      fisik, 
      waktu, 
      performa, 
      usaha, 
      frustrasi, 
      catatan 
    } = body;

    // 1. Validasi Data Wajib
    if (!sdm_id) {
      return NextResponse.json({ error: "Data SDM tidak valid (ID diperlukan)" }, { status: 400 });
    }

    // 2. Sanitasi Super Ketat: Pastikan input selalu berupa angka dan dibatasi 0-100
    const sanitizeScore = (val) => {
      let parsed = parseInt(val);
      if (isNaN(parsed)) return 0;     // Jika error/kosong, paksa jadi 0
      if (parsed > 100) return 100;    // Jika bocor lebih dari 100, paksa mentok 100
      if (parsed < 0) return 0;        // Jika minus, paksa mentok 0
      return parsed;
    };

    // 3. Eksekusi ke Database Turso
    await turso.execute({
      sql: `INSERT INTO log_nasa_tlx 
            (sdm_id, tanggal_isi, mental_demand, physical_demand, temporal_demand, performance, effort, frustration, catatan_kualitatif) 
            VALUES (?, date('now', '+7 hours'), ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        sdm_id, 
        sanitizeScore(mental), 
        sanitizeScore(fisik), 
        sanitizeScore(waktu), 
        sanitizeScore(performa), 
        sanitizeScore(usaha), 
        sanitizeScore(frustrasi), 
        catatan || "-" // Jika catatan kosong, isi dengan strip (-)
      ]
    });

    return NextResponse.json({ 
      success: true, 
      message: "Evaluasi NASA-TLX berhasil disimpan ke database!" 
    });
  } catch (error) {
    console.error("NASA-TLX API Error:", error);
    return NextResponse.json({ error: "Gagal menyimpan data: " + error.message }, { status: 500 });
  }
}