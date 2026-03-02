import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    /**
     * Mengambil data cuti dokter dan menggabungkannya dengan nomor WA 
     * dari tabel 'dokter' (Master Dokter).
     */
    const query = `
      SELECT 
        c.id,
        c.nama_dokter,
        c.jenis_cuti,
        c.tgl_mulai,
        c.tgl_selesai,
        c.tanggal_input,
        d.no_wa
      FROM cuti_dokter c
      LEFT JOIN dokter d ON c.nama_dokter = d.nama
      ORDER BY c.tanggal_input DESC
    `;

    const res = await turso.execute(query);

    // Kirim data dalam bentuk Array agar tidak error .map()
    return NextResponse.json(res.rows || []);

  } catch (error) {
    console.error("API Cuti Dokter Error:", error);
    // Jika database error, kirim array kosong agar aplikasi tidak crash
    return NextResponse.json([]);
  }
}