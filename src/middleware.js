import { NextResponse } from "next/server";

/**
 * PENTING: Menggunakan 'export default' untuk menghilangkan error 
 * "Middleware is missing expected function export name" di Next.js terbaru.
 */
export default function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // 1. Ambil "Karcis" Sesi (session_dak_pro)
  const session = request.cookies.get("session_dak_pro");

  // 2. DAFTAR HALAMAN BEBAS AKSES (ZONA HIJAU)
  // Menambahkan "/view-jadwal" agar teman-teman poli bisa buka tanpa login
  const isPublicPage = 
    pathname === "/login" || 
    pathname === "/signup" || 
    pathname === "/forgot-password" ||
    pathname === "/view-jadwal" ||
    pathname === "/laporan-eksekutif" ||
    pathname.startsWith("/shared");

  // 3. LOGIKA PROTEKSI:
  // Jika TIDAK ADA sesi dan mencoba buka halaman internal (seperti /sdm atau /buat-jadwal)
  if (!session && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 4. LOGIKA PENGALIHAN:
  // Jika SUDAH login tapi mencoba buka halaman Auth (Login/Signup), lempar ke Dashboard utama (/)
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/forgot-password";
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

// 5. KONFIGURASI MATCHER
export const config = {
  matcher: [
    /*
     * Pantau semua jalur kecuali:
     * - api (jalur data agar dashboard tetap bisa ditarik secara publik)
     * - _next/static (file sistem)
     * - _next/image (gambar)
     * - favicon.ico (ikon tab)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};