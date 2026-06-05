import { turso } from "@/lib/turso"; // Menggunakan koneksi terpusat
import { NextResponse } from "next/server";
import bcrypt from "bcrypt"; // Tambahkan pustaka untuk mencocokkan password terenkripsi

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "Username dan Password wajib diisi!" }, { status: 400 });
    }

    // 1. Tarik data user TERMASUK kolom password untuk dicocokkan nanti
    const result = await turso.execute({
      sql: "SELECT id, username, nama, role, ruangan, password FROM users WHERE username = ?",
      args: [username.toLowerCase()]
    });

    // Jika username tidak ditemukan di database
    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Username tidak terdaftar!" }, { status: 401 });
    }

    const user = result.rows[0];

    // 2. Verifikasi kecocokan kata sandi (Plain text vs Hashed password)
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json({ success: false, error: "Password yang Anda masukkan salah!" }, { status: 401 });
    }

    // 3. Simpan sesi (Mempertahankan logika Cookies yang sudah sangat aman)
    const sessionData = JSON.stringify({
      id: user.id,
      nama: user.nama,
      role: user.role,
      ruangan: user.ruangan || "POLIKLINIK" // Fallback aman ke Poliklinik
    });

    const response = NextResponse.json({ 
      success: true, 
      user: { nama: user.nama, role: user.role, ruangan: user.ruangan || "POLIKLINIK" } 
    });

    // Set HTTP-Only Cookie untuk keamanan tingkat tinggi
    response.cookies.set("session_dak_pro", sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24, // Sesi aktif selama 24 Jam
      path: "/",
      sameSite: "lax"
    });

    return response;

  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json({ success: false, error: "Gagal terhubung ke database DAK" }, { status: 500 });
  }
}