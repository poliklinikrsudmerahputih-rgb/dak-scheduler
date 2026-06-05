import { turso } from "@/lib/turso"; // Menggunakan koneksi terpusat
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

export async function POST(req) {
  try {
    // 1. Menambahkan kolom 'ruangan' ke dalam tangkapan form
    const { kode_rs, ruangan, nama, username, password, pertanyaan, jawaban } = await req.json();

    // Validasi Input Dasar
    if (!kode_rs || !ruangan || !nama || !username || !password || !pertanyaan || !jawaban) {
      return NextResponse.json({ success: false, error: "Semua kolom wajib diisi!" }, { status: 400 });
    }

    // 2. Cek Validitas Kode Rumah Sakit
    const checkHospital = await turso.execute({
      sql: "SELECT id, nama_rs FROM hospitals WHERE kode_rs = ?",
      args: [kode_rs.toUpperCase()]
    });

    if (checkHospital.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Kode Instansi / Faskes tidak ditemukan!" }, { status: 400 });
    }

    const hospitalId = checkHospital.rows[0].id;

    // 3. Cek apakah Username sudah terpakai
    const checkUser = await turso.execute({
      sql: "SELECT id FROM users WHERE username = ?",
      args: [username.toLowerCase()]
    });

    if (checkUser.rows.length > 0) {
      return NextResponse.json({ success: false, error: "Username sudah terdaftar!" }, { status: 400 });
    }

    // 4. Enkripsi (Hashing) Password & Jawaban Keamanan
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedJawaban = await bcrypt.hash(jawaban.toLowerCase(), 10);

    // 5. Simpan ke Database Turso dengan menyertakan hospital_id DAN ruangan
    await turso.execute({
      sql: `INSERT INTO users (hospital_id, ruangan, nama, username, password, role, pertanyaan_keamanan, jawaban_keamanan) 
            VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)`,
      args: [
        hospitalId,
        ruangan.toUpperCase(), // Menyimpan isolasi unit kerja
        nama.toUpperCase(), 
        username.toLowerCase(), 
        hashedPassword, 
        pertanyaan, 
        hashedJawaban
      ]
    });

    return NextResponse.json({ 
      success: true, 
      message: `Akun Karu unit ${ruangan.toUpperCase()} berhasil dibuat untuk ${checkHospital.rows[0].nama_rs}` 
    });

  } catch (error) {
    console.error("Signup Error:", error);
    return NextResponse.json({ success: false, error: "Gagal menghubungkan ke Turso DB" }, { status: 500 });
  }
}