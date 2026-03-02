import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import bcrypt from "bcrypt";
import { cookies } from "next/headers";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "Isi Username & Password!" }, { status: 400 });
    }

    // 1. Cari User di Database
    const res = await client.execute({
      sql: "SELECT * FROM users WHERE username = ?",
      args: [username.toLowerCase()]
    });

    const user = res.rows[0];

    // 2. Jika User tidak ditemukan
    if (!user) {
      return NextResponse.json({ success: false, error: "Username tidak terdaftar!" }, { status: 401 });
    }

    // 3. Cek Password (Bandingkan Input vs Hash di DB)
    const passwordCocok = await bcrypt.compare(password, user.password);

    if (!passwordCocok) {
      return NextResponse.json({ success: false, error: "Password salah!" }, { status: 401 });
    }

    // 4. Buat Session (Cookie)
    // Di sini kita simpan Nama dan Role agar bisa dipakai di Dashboard
    const dataUser = {
      id: user.id,
      nama: user.nama,
      role: user.role,
    };

    const cookieStore = await cookies();
    cookieStore.set("dak_session", JSON.stringify(dataUser), {
      httpOnly: true, // Aman dari hacker browser
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24, // Aktif selama 24 jam
      path: "/",
    });

    return NextResponse.json({ 
      success: true, 
      message: "Login Berhasil!",
      user: { nama: user.nama, role: user.role }
    });

  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json({ success: false, error: "Gangguan Server DAK-AUTH" }, { status: 500 });
  }
}