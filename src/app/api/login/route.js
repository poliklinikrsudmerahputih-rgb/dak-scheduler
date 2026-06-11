import { turso } from "@/lib/turso"; 
import { NextResponse } from "next/server";
import bcrypt from "bcrypt"; 

// Memaksa Next.js agar selalu memproses login secara dinamis
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    // 1. PENGAMANAN PENANGKAPAN DATA
    // Mencegah server crash jika frontend mengirim format data yang salah
    const body = await req.json().catch(() => null);
    
    if (!body) {
      return NextResponse.json({ success: false, error: "Format request ditolak server. Pastikan mengirim format JSON." }, { status: 400 });
    }

    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "Username dan Password wajib diisi!" }, { status: 400 });
    }

    // 2. TARIK DATA DARI DATABASE TURSO
    const result = await turso.execute({
      sql: "SELECT id, username, nama, role, ruangan, password FROM users WHERE username = ?",
      args: [username.toLowerCase()]
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Username tidak terdaftar!" }, { status: 401 });
    }

    const user = result.rows[0];

    // 3. VERIFIKASI KATA SANDI DENGAN BCRYPT SAFE-MODE
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, user.password);
    } catch (bcryptError) {
      console.error("Bcrypt Engine Error:", bcryptError);
      return NextResponse.json({ success: false, error: "Mesin Enkripsi Server bermasalah. Harap gunakan 'bcryptjs'." }, { status: 500 });
    }

    if (!isPasswordValid) {
      return NextResponse.json({ success: false, error: "Password yang Anda masukkan salah!" }, { status: 401 });
    }

    // 4. PEMBUATAN TIKET SESI (COOKIE)
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

    // 5. INJEKSI COOKIE KE BROWSER
    // Perbaikan: httpOnly diset 'false' sementara agar frontend Bapak bisa membaca 
    // data cookie ini untuk menampilkan nama user atau mengatur rute.
    response.cookies.set("session_dak_pro", sessionData, {
      httpOnly: false, 
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24, // Sesi aktif 24 Jam
      path: "/",
      sameSite: "lax"
    });

    return response;

  } catch (error) {
    console.error("Login Server Error:", error);
    // PERBAIKAN FATAL: Server tidak lagi menyembunyikan error.
    // Jika gagal terhubung ke Turso, pesan aslinya akan dilempar ke frontend Bapak.
    return NextResponse.json({ success: false, error: `Sistem Error: ${error.message}` }, { status: 500 });
  }
}