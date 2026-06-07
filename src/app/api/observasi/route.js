import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

// FUNGSI GET: Untuk mengambil nomor kejadian berikutnya agar otomatis
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sdm_id = searchParams.get("sdm_id");

    if (!sdm_id) return NextResponse.json({ error: "SDM ID diperlukan" }, { status: 400 });

    // Mencari nomor kejadian terakhir untuk perawat tersebut
    const res = await turso.execute({
      sql: `SELECT MAX(no_kejadian) as last_count 
            FROM log_observasi_kerja 
            WHERE sdm_id = ?`,
      args: [sdm_id]
    });

    const lastCount = res.rows[0].last_count || 0;
    return NextResponse.json({ last_count: lastCount });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// FUNGSI POST: Untuk menyimpan data observasi
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
      no_kejadian // Menerima nomor kejadian dari frontend
    } = body;

    if (!sdm_id || !blok_kategori || !waktu_mulai || !waktu_selesai || !no_kejadian) {
      return NextResponse.json({ error: "Data observasi tidak lengkap" }, { status: 400 });
    }

    await turso.execute({
      sql: `INSERT INTO log_observasi_kerja 
            (sdm_id, ruangan, tanggal_input, blok_kategori, detail_tindakan, waktu_mulai, waktu_selesai, durasi_menit, no_kejadian) 
            VALUES (?, ?, date('now', '+7 hours'), ?, ?, ?, ?, ?, ?)`,
      args: [
        sdm_id, 
        ruangan.toUpperCase(), 
        blok_kategori.toUpperCase(), 
        detail_tindakan || "", 
        waktu_mulai, 
        waktu_selesai, 
        Math.round(durasi_menit),
        no_kejadian
      ]
    });

    return NextResponse.json({ success: true, message: `Kejadian #${no_kejadian} tersimpan.` });
  } catch (error) {
    console.error("Observasi API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}