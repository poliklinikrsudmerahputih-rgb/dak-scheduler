import { createClient } from "@libsql/client";
import { NextResponse } from "next/server";

// Konfigurasi koneksi ke Turso
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function POST(req) {
  try {
    // 1. Menerima data dari frontend
    const { nama, username, password, pertanyaan, jawaban } = await req.json();

    // 2. Cek apakah username sudah ada (Proteksi Double Akun)
    const existingUser = await client.execute({
      sql: "SELECT id FROM sdm WHERE username = ?",
      args: [username]
    });

    if (existingUser.rows.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Username ini sudah terdaftar di sistem!" 
      }, { status: 400 });
    }

    // 3. Simpan data ke tabel sdm
    // Nama kolom disesuaikan dengan Turso Bapak: pertanyaan_keamanan & jawaban_keamanan
    await client.execute({
      sql: `INSERT INTO sdm (
        nama, 
        username, 
        password, 
        role, 
        pertanyaan_keamanan, 
        jawaban_keamanan
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [nama, username, password, "staff", pertanyaan, jawaban]
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Signup Database Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Gagal menyimpan: Pastikan koneksi database benar." 
    }, { status: 500 });
  }
}