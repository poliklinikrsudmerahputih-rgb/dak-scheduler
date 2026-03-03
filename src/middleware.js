import { NextResponse } from "next/server";

export function middleware(request) {
  // 1. Cek apakah ada cookie login (session_dak_pro)
  const session = request.cookies.get("session_dak_pro");
  const path = request.nextUrl.pathname;

  // 2. Jika tidak ada sesi dan mencoba buka dashboard/master, tendang ke login
  if (!session && (path === "/" || path.startsWith("/sdm") || path.startsWith("/dokter") || path.startsWith("/buat-jadwal"))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 3. Jika sudah login tapi malah buka halaman login, arahkan ke dashboard
  if (session && (path === "/login" || path === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};