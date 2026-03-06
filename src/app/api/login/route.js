import { createClient } from "@libsql/client";
import { NextResponse } from "next/server";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    const result = await client.execute({
      sql: "SELECT id, username, nama, role, ruangan FROM users WHERE username = ? AND password = ?",
      args: [username, password]
    });

    if (result.rows.length > 0) {
      const user = result.rows[0];
      
      // PERBAIKAN: Gunakan POLIKLINIK sebagai default terkuat saat transisi
      const sessionData = JSON.stringify({
        id: user.id,
        nama: user.nama,
        role: user.role,
        ruangan: user.ruangan || "POLIKLINIK" 
      });

      const response = NextResponse.json({ 
        success: true, 
        user: { nama: user.nama, role: user.role, ruangan: user.ruangan || "POLIKLINIK" } 
      });

      response.cookies.set("session_dak_pro", sessionData, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24,
        path: "/",
        sameSite: "lax"
      });

      return response;
    } else {
      return NextResponse.json({ success: false, error: "Username/Password salah!" }, { status: 401 });
    }
  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json({ success: false, error: "Gagal terhubung ke database" }, { status: 500 });
  }
}