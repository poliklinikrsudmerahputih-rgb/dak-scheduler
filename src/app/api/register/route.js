import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import bcrypt from "bcrypt"; // Tambahkan pustaka enkripsi password

export async function POST(req) {
  try {
    // 1. Tangkap seluruh payload data dari Register Page Frontend
    const { nama, username, password, ruangan, role, pertanyaan, jawaban } = await req.json();

    // Validasi input wajib untuk mencegah data kosong di database
    if (!nama || !username || !password || !ruangan) {
      return NextResponse.json({ error: "Kolom nama, username, password, dan ruangan wajib diisi!" }, { status: 400 });
    }

    // 2. Cek terlebih dahulu apakah username sudah pernah terdaftar
    const existingUser = await turso.execute({
      sql: "SELECT id FROM users WHERE username = ?",
      args: [username.toLowerCase()]
    });

    if (existingUser.rows.length > 0) {
      return NextResponse.json({ error: "Username ini sudah terdaftar!" }, { status: 400 });
    }

    // 3. Amankan password dan jawaban pemulihan dengan enkripsi Hashing
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedJawaban = jawaban ? await bcrypt.hash(jawaban.toLowerCase(), 10) : null;

    // 4. Simpan data ke tabel users menggunakan parameter terenkripsi dan ruangan yang dipilih
    await turso.execute({
      sql: `INSERT INTO users (
        nama, 
        username, 
        password, 
        ruangan, 
        role, 
        pertanyaan_keamanan, 
        jawaban_keamanan
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nama.toUpperCase(),            // Standardisasi nama dengan huruf kapital
        username.toLowerCase(),        // Standardisasi username dengan huruf kecil
        hashedPassword,                // Password terenkripsi
        ruangan.toUpperCase(),         // Mengunci unit kerja (IGD, ICU, POLIKLINIK, dll)
        role || "admin_ruangan",       // Menyimpan hak akses unit
        pertanyaan || null,
        hashedJawaban
      ]
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register Error:", error);
    return NextResponse.json({ error: "Gagal menyimpan akun ke database DAK" }, { status: 500 });
  }
}