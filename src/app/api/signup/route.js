import { createClient } from "@libsql/client";
import { NextResponse } from "next/server";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function POST(req) {
  try {
    // 1. Tangkap data dari Form (Termasuk 'ruangan' yang baru kita tambahkan)
    const { nama, username, password, ruangan, pertanyaan, jawaban } = await req.json();

    // 2. Cek apakah username sudah ada
    const existingUser = await client.execute({
      sql: "SELECT id FROM users WHERE username = ?",
      args: [username]
    });

    if (existingUser.rows.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Username ini sudah terdaftar!" 
      }, { status: 400 });
    }

    // 3. Simpan ke tabel USERS dengan kolom RUANGAN (Sangat Penting!)
    // Pastikan urutan kolom dan urutan args sama persis
    await client.execute({
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
        nama, 
        username, 
        password, 
        ruangan || "POLIKLINIK", // Beri default jika user lupa pilih
        "admin", 
        pertanyaan, 
        jawaban
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