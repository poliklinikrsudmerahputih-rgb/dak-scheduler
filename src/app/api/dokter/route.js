import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Memaksa Next.js agar selalu mengambil data terbaru secara Live (Bypass Cache)
export const dynamic = "force-dynamic";

// ====================================================================
// 1. FUNGSI GET (Mengambil Data Cuti Dokter - Fleksibel Session & Public Link)
// ====================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // ISOLASI KEAMANAN (RLS) YANG FLEKSIBEL UNTUK SHARE LINK
    const cookieStore = await cookies();
    const session = cookieStore.get("session_dak_pro");
    
    let userRuangan = "POLIKLINIK"; 
    const paramRuangan = searchParams.get("ruangan");

    if (session) {
      try {
        const userData = JSON.parse(session.value);
        userRuangan = userData.ruangan || "POLIKLINIK";
      } catch (e) {
        console.warn("Format cookie lama terdeteksi");
      }
    } else if (paramRuangan) {
      // Izinkan akses jika ruangan dilempar via URL parameter (Mode Public Link)
      userRuangan = paramRuangan;
    }

    const kunciRuangan = String(userRuangan).trim().toUpperCase();

    // Ambil riwayat cuti dokter untuk ruangan terkait
    const result = await turso.execute({
      sql: `
        SELECT * FROM cuti_dokter 
        WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
        ORDER BY tgl_mulai DESC, id DESC
      `,
      args: [kunciRuangan]
    });

    return NextResponse.json(result.rows || []);
    
  } catch (error) {
    console.error("Gagal ambil data cuti dokter:", error);
    return NextResponse.json([]); // Kembalikan array kosong agar map() di frontend tidak crash
  }
}

// ====================================================================
// 2. FUNGSI POST (Menyimpan Pengajuan Cuti Dokter Baru)
// ====================================================================
export async function POST(request) {
  try {
    const body = await request.json();
    const { nama_dokter, tgl_mulai, tgl_selesai, alasan, ruangan } = body;

    if (!nama_dokter || !tgl_mulai || !tgl_selesai) {
      return NextResponse.json({ error: "Parameter pengajuan cuti tidak lengkap." }, { status: 400 });
    }

    // Deteksi ruangan cadangan jika form dari frontend luput mengirimkan nama ruangan
    let targetRuangan = ruangan;
    if (!targetRuangan) {
      const cookieStore = await cookies();
      const session = cookieStore.get("session_dak_pro");
      if (session) {
        const userData = JSON.parse(session.value);
        targetRuangan = userData.ruangan;
      }
    }
    
    const kunciRuangan = String(targetRuangan || "POLIKLINIK").trim().toUpperCase();

    // Masukkan data cuti dokter ke database Turso
    await turso.execute({
      sql: `
        INSERT INTO cuti_dokter (nama_dokter, tgl_mulai, tgl_selesai, alasan, ruangan) 
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        String(nama_dokter).trim(), 
        tgl_mulai, 
        tgl_selesai, 
        alasan || "-", 
        kunciRuangan
      ]
    });

    return NextResponse.json({ success: true, message: "Data cuti dokter berhasil disimpan secara real-time." });

  } catch (error) {
    console.error("Gagal menyimpan cuti dokter:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}