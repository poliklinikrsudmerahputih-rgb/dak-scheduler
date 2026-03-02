import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import bcrypt from "bcrypt";

// Konfigurasi Client Turso
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function POST(req) {
  try {
    const { nama, username, password, pertanyaan, jawaban } = await req.json();

    // 1. Validasi Input Dasar
    if (!nama || !username || !password || !pertanyaan || !jawaban) {
      return NextResponse.json({ success: false, error: "Semua kolom wajib diisi!" }, { status: 400 });
    }

    // 2. Cek apakah Username sudah terpakai
    const checkUser = await client.execute({
      sql: "SELECT id FROM users WHERE username = ?",
      args: [username.toLowerCase()]
    });

    if (checkUser.rows.length > 0) {
      return NextResponse.json({ success: false, error: "Username sudah terdaftar!" }, { status: 400 });
    }

    // 3. Enkripsi (Hashing) Password & Jawaban Keamanan
    // Kita gunakan salt round 10 agar aman namun tetap cepat
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedJawaban = await bcrypt.hash(jawaban.toLowerCase(), 10);

    // 4. Simpan ke Database Turso
    await client.execute({
      sql: `INSERT INTO users (nama, username, password, role, pertanyaan_keamanan, jawaban_keamanan) 
            VALUES (?, ?, ?, 'admin', ?, ?)`,
      args: [
        nama.toUpperCase(), 
        username.toLowerCase(), 
        hashedPassword, 
        pertanyaan, 
        hashedJawaban
      ]
    });

    return NextResponse.json({ 
      success: true, 
      message: "Akun DAK-SYSTEM Berhasil Dibuat!" 
    });

  } catch (error) {
    console.error("Signup Error:", error);
    return NextResponse.json({ success: false, error: "Gagal menghubungkan ke Turso DB" }, { status: 500 });
  }
}