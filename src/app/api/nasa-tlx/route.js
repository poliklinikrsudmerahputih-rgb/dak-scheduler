import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

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

    // 1. Validasi Data Wajib: Pastikan ID SDM ada
    if (!sdm_id) {
      return NextResponse.json({ error: "Data SDM tidak valid (ID diperlukan)" }, { status: 400 });
    }

    // 2. Sanitasi Data: Pastikan nilai angka berada di rentang 0-100 (opsional tapi disarankan)
    const validate = (val) => (val !== undefined && val !== null ? parseInt(val) : 0);

    // 3. Eksekusi ke Database Turso
    await turso.execute({
      sql: `INSERT INTO log_nasa_tlx 
            (sdm_id, tanggal_isi, mental_demand, physical_demand, temporal_demand, performance, effort, frustration, catatan_kualitatif) 
            VALUES (?, date('now', '+7 hours'), ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        sdm_id, 
        validate(mental), 
        validate(fisik), 
        validate(waktu), 
        validate(performa), 
        validate(usaha), 
        validate(frustrasi), 
        catatan || ""
      ]
    });

    return NextResponse.json({ 
      success: true, 
      message: "Evaluasi kinerja (NASA-TLX) berhasil disimpan ke database" 
    });
  } catch (error) {
    console.error("NASA-TLX API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}