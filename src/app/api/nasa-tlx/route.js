import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

// =====================================================================
// FUNGSI GET: Menarik data mentah untuk tabel E-Log di Frontend
// =====================================================================
export async function GET(request) {
  try {
    // Karena Frontend memanggil fetch('/api/nasa-tlx') tanpa parameter,
    // kita kembalikan seluruh data log (diurutkan dari yang terbaru)
    // Alias (AS) digunakan agar namanya cocok dengan variabel di Frontend
    const res = await turso.execute(`
      SELECT 
        id, 
        sdm_id, 
        ruangan,
        mental_demand AS mental, 
        physical_demand AS fisik, 
        temporal_demand AS waktu, 
        performance AS performa, 
        effort AS usaha, 
        frustration AS frustrasi, 
        catatan_kualitatif AS catatan,
        tanggal_isi
      FROM log_nasa_tlx
      ORDER BY id DESC
    `);
    
    // Kembalikan langsung baris datanya (Frontend mengecek Array.isArray)
    return NextResponse.json(res.rows);
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
      ruangan, // Menangkap data ruangan spesifik (Misal: NERS 3 (THT))
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

    const safeRuangan = ruangan ? ruangan.toUpperCase() : "RAWAT JALAN";

    // 3. Eksekusi ke Database Turso
    await turso.execute({
      sql: `INSERT INTO log_nasa_tlx 
            (sdm_id, ruangan, tanggal_isi, mental_demand, physical_demand, temporal_demand, performance, effort, frustration, catatan_kualitatif) 
            VALUES (?, ?, date('now', '+7 hours'), ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        sdm_id, 
        safeRuangan, // Parameter ruangan disisipkan di sini
        sanitizeScore(mental), 
        sanitizeScore(fisik), 
        sanitizeScore(waktu), 
        sanitizeScore(performa), 
        sanitizeScore(usaha), 
        sanitizeScore(frustrasi), 
        catatan || "-" 
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