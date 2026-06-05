import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";
import bcrypt from "bcrypt"; // Wajib untuk membongkar dan membuat sandi acak

export async function POST(req) {
  try {
    const { username, jawaban, passwordBaru } = await req.json();

    if (!username || !jawaban || !passwordBaru) {
      return NextResponse.json({ 
        success: false, 
        error: "Formulir tidak lengkap!" 
      }, { status: 400 });
    }

    // 1. Cari user di database berdasarkan Username (Wajib Lowercase)
    const result = await turso.execute({
      sql: "SELECT id, jawaban_keamanan FROM users WHERE username = ?",
      args: [username.toLowerCase()]
    });

    // Jika username tidak terdaftar
    if (result.rows.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Verifikasi Gagal: ID Pegawai tidak ditemukan!" 
      }, { status: 401 });
    }

    const user = result.rows[0];

    // 2. Verifikasi Jawaban Keamanan menggunakan bcrypt.compare
    // Mencocokkan jawaban yang diketik (lowercase) dengan jawaban acak di database
    const isJawabanValid = await bcrypt.compare(jawaban.toLowerCase(), user.jawaban_keamanan);

    if (!isJawabanValid) {
      return NextResponse.json({ 
        success: false, 
        error: "Verifikasi Gagal: Jawaban Keamanan Anda salah!" 
      }, { status: 401 });
    }

    // 3. Enkripsi (Hash) Password Baru sebelum disimpan
    const hashedPasswordBaru = await bcrypt.hash(passwordBaru, 10);

    // 4. Update Password di tabel USERS dengan sandi yang sudah aman
    await turso.execute({
      sql: "UPDATE users SET password = ? WHERE id = ?",
      args: [hashedPasswordBaru, user.id]
    });

    return NextResponse.json({ 
      success: true,
      message: "Kata sandi berhasil dipulihkan."
    });

  } catch (error) {
    console.error("Recovery Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Gagal memproses pemulihan ke database DAK." 
    }, { status: 500 });
  }
}