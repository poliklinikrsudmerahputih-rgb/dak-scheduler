import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

const isValidDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

async function getSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session_dak_pro");
  if (!sessionCookie) return null;

  try {
    const user = JSON.parse(sessionCookie.value);
    const ruangan = String(user?.ruangan || "").trim().toUpperCase();
    if (!ruangan) return null;
    return {
      ruangan,
      nama: String(user?.nama || user?.username || "").trim() || null,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });

    const result = await turso.execute({
      sql: `SELECT id, tanggal, informasi, ruangan, public_token, created_at, updated_at
            FROM metmor
            WHERE UPPER(TRIM(ruangan)) = ?
            ORDER BY tanggal DESC, id DESC
            LIMIT 200`,
      args: [session.ruangan],
    });
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Gagal mengambil data Metmor:", error);
    return NextResponse.json({ success: false, error: "Gagal mengambil data Metmor." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Format data tidak valid." }, { status: 400 });
    }

    const tanggal = String(body?.tanggal || "").trim();
    const informasi = typeof body?.informasi === "string" ? body.informasi.trim() : "";
    if (!isValidDate(tanggal) || !informasi || informasi.length > 10000) {
      return NextResponse.json({ error: "Tanggal wajib valid dan informasi wajib diisi (maksimal 10.000 karakter)." }, { status: 400 });
    }

    const publicToken = randomUUID();
    const result = await turso.execute({
      sql: `INSERT INTO metmor (tanggal, informasi, ruangan, public_token, created_by)
            VALUES (?, ?, ?, ?, ?)`,
      args: [tanggal, informasi, session.ruangan, publicToken, session.nama],
    });
    return NextResponse.json({
      success: true,
      data: { id: Number(result.lastInsertRowid), tanggal, informasi, ruangan: session.ruangan, public_token: publicToken },
    }, { status: 201 });
  } catch (error) {
    console.error("Gagal menyimpan data Metmor:", error);
    return NextResponse.json({ success: false, error: "Gagal menyimpan data Metmor." }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Format data tidak valid." }, { status: 400 });
    }

    const id = Number(body?.id);
    const tanggal = String(body?.tanggal || "").trim();
    const informasi = typeof body?.informasi === "string" ? body.informasi.trim() : "";
    if (!Number.isSafeInteger(id) || id <= 0 || !isValidDate(tanggal) || !informasi || informasi.length > 10000) {
      return NextResponse.json({ error: "Data Metmor tidak valid." }, { status: 400 });
    }

    const result = await turso.execute({
      sql: `UPDATE metmor SET tanggal = ?, informasi = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [tanggal, informasi, id, session.ruangan],
    });
    if (!result.rowsAffected) return NextResponse.json({ error: "Data Metmor tidak ditemukan." }, { status: 404 });

    const updated = await turso.execute({
      sql: `SELECT id, tanggal, informasi, ruangan, public_token, created_at, updated_at
            FROM metmor WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [id, session.ruangan],
    });
    return NextResponse.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    console.error("Gagal memperbarui data Metmor:", error);
    return NextResponse.json({ success: false, error: "Gagal memperbarui data Metmor." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID Metmor tidak valid." }, { status: 400 });
    }

    const result = await turso.execute({
      sql: "DELETE FROM metmor WHERE id = ? AND UPPER(TRIM(ruangan)) = ?",
      args: [id, session.ruangan],
    });
    if (!result.rowsAffected) return NextResponse.json({ error: "Data Metmor tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Gagal menghapus data Metmor:", error);
    return NextResponse.json({ success: false, error: "Gagal menghapus data Metmor." }, { status: 500 });
  }
}
