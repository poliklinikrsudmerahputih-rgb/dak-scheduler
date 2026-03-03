import { createClient } from "@libsql/client";
import { NextResponse } from "next/server";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function POST(req) {
  try {
    const { nama, username, password, pertanyaan, jawaban } = await req.json();

    // 1. Cek apakah username sudah ada di tabel USERS
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

    // 2. Simpan ke tabel USERS (Bukan SDM)
    await client.execute({
      sql: `INSERT INTO users (
        nama, 
        username, 
        password, 
        role, 
        pertanyaan_keamanan, 
        jawaban_keamanan
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [nama, username, password, "admin", pertanyaan, jawaban]
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Signup Error:", error);
    return NextResponse.json({ success: false, error: "Gagal menyimpan akun." }, { status: 500 });
  }
}