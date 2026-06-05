import { turso } from "@/lib/turso"; // Menggunakan koneksi terpusat
import { NextResponse } from "next/server";
import bcrypt from "bcrypt"; // Tambahkan untuk enkripsi password

export async function POST(req) {
  try {
    // 1. Tangkap data dari Form (Termasuk variabel ruangan dan keamanan)
    const { nama, username, password, ruangan, role, pertanyaan, jawaban } = await req.json();

    // Validasi data wajib isi
    if (!nama || !username || !password || !ruangan) {
      return NextResponse.json({ 
        success: false, 
        error: "Kolom nama, username, password, dan ruangan wajib diisi!" 
      }, { status: 400 });
    }

    // 2. Cek apakah username sudah ada (Gunakan lowercase agar pencarian akurat)
    const existingUser = await turso.execute({
      sql: "SELECT id FROM users WHERE username = ?",
      args: [username.toLowerCase()]
    });

    if (existingUser.rows.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Username ini sudah terdaftar!" 
      }, { status: 400 });
    }

    // 3. Enkripsi (Hashing) Password & Jawaban Keamanan
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedJawaban = jawaban ? await bcrypt.hash(jawaban.toLowerCase(), 10) : null;

    // 4. Simpan ke tabel USERS dengan pemisahan RUANGAN
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
        nama.toUpperCase(), 
        username.toLowerCase(), 
        hashedPassword, 
        ruangan.toUpperCase(), // Mengunci unit kerja (POLIKLINIK, IGD, ICU, dll)
        role || "admin_ruangan", 
        pertanyaan || null, 
        hashedJawaban
      ]
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Signup Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Gagal menyimpan akun ke database DAK." 
    }, { status: 500 });
  }
}