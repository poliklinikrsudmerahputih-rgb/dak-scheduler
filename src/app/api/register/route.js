import { turso } from "@/lib/turso";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { nama, username, password, ruangan, role } = await req.json();

    // Simpan ke tabel users (Sesuai kolom ruangan yang kita tambahkan tadi)
    await turso.execute({
      sql: "INSERT INTO users (nama, username, password, ruangan, role) VALUES (?, ?, ?, ?, ?)",
      args: [nama, username, password, ruangan, role]
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register Error:", error);
    return NextResponse.json({ error: "Username sudah digunakan atau database error" }, { status: 500 });
  }
}