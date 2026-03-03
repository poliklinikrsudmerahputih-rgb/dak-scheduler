import { createClient } from "@libsql/client";
import { NextResponse } from "next/server";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function POST(req) {
  try {
    const { username, jawaban, passwordBaru } = await req.json();

    // 1. Verifikasi apakah Username dan Jawaban Rahasia cocok di tabel USERS (Bukan SDM)
    const result = await client.execute({
      sql: "SELECT id FROM users WHERE username = ? AND jawaban_keamanan = ?",
      args: [username, jawaban]
    });

    // 2. Jika tidak ditemukan yang cocok
    if (result.rows.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Verifikasi Gagal: ID Pegawai atau Jawaban Salah!" 
      }, { status: 401 });
    }

    // 3. Jika cocok, update password di tabel USERS
    await client.execute({
      sql: "UPDATE users SET password = ? WHERE username = ?",
      args: [passwordBaru, username]
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Recovery Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Gagal terhubung ke DAK-Database. Cek koneksi Turso." 
    }, { status: 500 });
  }
}