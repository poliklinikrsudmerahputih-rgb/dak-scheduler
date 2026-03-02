import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import bcrypt from "bcrypt";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function POST(req) {
  try {
    const { username, jawaban, passwordBaru } = await req.json();

    // 1. Cari user berdasarkan username
    const res = await client.execute({
      sql: "SELECT * FROM users WHERE username = ?",
      args: [username.toLowerCase()]
    });

    const user = res.rows[0];

    if (!user) {
      return NextResponse.json({ success: false, error: "Username tidak ditemukan!" }, { status: 404 });
    }

    // 2. Verifikasi Jawaban Keamanan (Bandingkan input dengan hash di DB)
    const jawabanCocok = await bcrypt.compare(jawaban.toLowerCase(), user.jawaban_keamanan);

    if (!jawabanCocok) {
      return NextResponse.json({ success: false, error: "Jawaban Keamanan Salah!" }, { status: 401 });
    }

    // 3. Hash Password Baru
    const hashedNewPassword = await bcrypt.hash(passwordBaru, 10);

    // 4. Update di Database Turso
    await client.execute({
      sql: "UPDATE users SET password = ? WHERE id = ?",
      args: [hashedNewPassword, user.id]
    });

    return NextResponse.json({ success: true, message: "Password berhasil diperbarui!" });

  } catch (error) {
    console.error("Reset Password Error:", error);
    return NextResponse.json({ success: false, error: "Gagal memperbarui password" }, { status: 500 });
  }
}