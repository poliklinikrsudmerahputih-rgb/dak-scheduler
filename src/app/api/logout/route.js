import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ 
    success: true, 
    message: "Logged Out dari Sistem DAK-PRO" 
  });

  // HAPUS COOKIE (Nama harus sama dengan yang ada di login/route.js)
  response.cookies.set("session_dak_pro", "", { 
    httpOnly: true,
    expires: new Date(0), // Setel ke masa lalu agar langsung terhapus
    path: "/" 
  });

  return response;
}