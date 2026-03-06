import { NextResponse } from "next/server";

// Gunakan nama fungsi 'middleware' secara spesifik
export function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // 1. Ambil "Karcis" Sesi (session_dak_pro)
  const session = request.cookies.get("session_dak_pro");

  // 2. DAFTAR HALAMAN BEBAS AKSES (ZONA HIJAU)
  // Pastikan nama di sini sama dengan folder Bapak: /signup dan /forgot-password
  const isAuthPage = 
    pathname === "/login" || 
    pathname === "/signup" || 
    pathname === "/forgot-password";

  // 3. LOGIKA PROTEKSI:
  // Jika TIDAK ADA sesi dan mencoba buka halaman rahasia
  if (!session && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 4. LOGIKA PENGALIHAN:
  // Jika SUDAH login tapi mencoba buka Login/Signup/Forgot lagi
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

// 5. KONFIGURASI MATCHER
export const config = {
  matcher: [
    /*
     * Pantau semua halaman kecuali:
     * - api (jalur data)
     * - _next/static (file sistem)
     * - _next/image (gambar)
     * - favicon.ico (ikon tab)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};