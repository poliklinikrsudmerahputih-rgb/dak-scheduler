import { createClient } from "@libsql/client";
import { NextResponse } from "next/server";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    // 1. Ambil data user dari tabel USERS (Bukan SDM)
    const result = await client.execute({
      sql: "SELECT * FROM users WHERE username = ? AND password = ?",
      args: [username, password]
    });

    if (result.rows.length > 0) {
      const user = result.rows[0];
      
      // 2. Buat Respon Berhasil
      const response = NextResponse.json({ 
        success: true, 
        user: { nama: user.nama, role: user.role } 
      });

      // 3. TAMBAHKAN COOKIE (Agar Dashboard Terkunci & Sesi Tersimpan)
      // Ini akan membuat file 'session_dak_pro' di browser Bapak
      response.cookies.set("session_dak_pro", "active", {
        httpOnly: true, // Keamanan ekstra agar tidak bisa dicuri script jahat
        secure: process.env.NODE_ENV === "production", // Aktifkan SSL di Vercel
        maxAge: 60 * 60 * 24, // Berlaku selama 24 jam
        path: "/",
      });

      return response;
    } else {
      return NextResponse.json({ 
        success: false, 
        error: "ID PEGAWAI atau Password salah!" 
      }, { status: 401 });
    }

  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Gagal terhubung ke database DAK" 
    }, { status: 500 });
  }
}