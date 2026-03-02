import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    /**
     * Mengambil data pengajuan cuti SDM.
     * Menggunakan LEFT JOIN agar data cuti tetap tampil meskipun 
     * nomor WA di tabel SDM belum terisi atau nama tidak cocok sempurna.
     */
    const query = `
      SELECT 
        c.id,
        c.nama_sdm,
        c.jenis_cuti,
        c.tgl_mulai,
        c.tgl_selesai,
        c.alasan,
        c.tanggal_input,
        c.status_acc,
        s.no_wa
      FROM cuti_sdm c
      LEFT JOIN sdm s ON c.nama_sdm = s.nama
      ORDER BY c.tanggal_input DESC
    `;

    const res = await turso.execute(query);

    /**
     * PENTING: Next.js Client mengharapkan hasil dalam bentuk Array.
     * res.rows dari Turso dipastikan dikirim sebagai Array agar fungsi .map() tidak error.
     */
    return NextResponse.json(res.rows || []);

  } catch (error) {
    console.error("Database Error [GET /api/cuti-sdm]:", error);

    /**
     * Jika terjadi error database, kita tetap mengembalikan Array Kosong [].
     * Ini mencegah tampilan "dataCuti.map is not a function" di sisi user.
     */
    return NextResponse.json([], { 
      status: 200, // Tetap gunakan 200 agar frontend bisa handle sebagai 'Data Kosong'
      statusText: "Database connection failed" 
    });
  }
}