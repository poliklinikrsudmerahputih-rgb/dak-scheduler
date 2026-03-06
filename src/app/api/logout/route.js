import { NextResponse } from "next/server";

export async function POST() {
  try {
    // 1. Siapkan respon sukses
    const response = NextResponse.json({ 
      success: true, 
      message: "Sesi telah berakhir. Anda keluar dari Sistem DAK-PRO." 
    });

    // 2. HAPUS COOKIE SESI (Kunci utama agar Middleware langsung memblokir akses)
    // Nama cookie 'session_dak_pro' harus sama persis dengan yang ada di login/route.js
    response.cookies.set("session_dak_pro", "", { 
      httpOnly: true, // Keamanan agar tidak bisa diakses script client
      secure: process.env.NODE_ENV === "production", // Gunakan SSL jika sudah di Vercel
      expires: new Date(0), // Detik ini juga cookie dianggap kadaluarsa (1 Januari 1970)
      path: "/", // Pastikan path-nya root agar terhapus di semua folder
      sameSite: "lax" // Menjaga kompatibilitas navigasi browser
    });

    return response;
  } catch (error) {
    console.error("Logout API Error:", error);
    return NextResponse.json({ success: false, error: "Gagal menghapus sesi" }, { status: 500 });
  }
}