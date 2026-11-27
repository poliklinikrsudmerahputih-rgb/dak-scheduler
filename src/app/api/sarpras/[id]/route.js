import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { parseSessionValue } from "@/lib/session";
import { validateSarprasRecord } from "@/lib/sarpras";

export const dynamic = "force-dynamic";

async function getSessionRuangan() {
  const sessionCookie = (await cookies()).get("session_dak_pro");
  const session = parseSessionValue(sessionCookie);
  const ruangan = typeof session?.ruangan === "string" ? session.ruangan.trim().toUpperCase() : "";
  return ruangan || null;
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request, { params }) {
  const ruangan = await getSessionRuangan();
  if (!ruangan) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ success: false, error: "ID sarpras tidak valid." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Format data tidak valid." }, { status: 400 });
  }

  const validated = validateSarprasRecord(body);
  if (validated.error) {
    return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
  }

  try {
    const { kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan, permintaan, spesifikasi, tahun } = validated.value;
    const result = await turso.execute({
      sql: `UPDATE sarpras_rawat_jalan
            SET kategori = ?, nama_barang = ?, klinik = ?, kebutuhan = ?, keadaan = ?,
                kekurangan = ?, permintaan = ?, spesifikasi = ?, tahun = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan, permintaan, spesifikasi, tahun, id, ruangan],
    });
    if (result.rowsAffected === 0) {
      return NextResponse.json({ success: false, error: "Data sarpras tidak ditemukan di ruangan Anda." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sarpras update failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memperbarui data sarpras." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const ruangan = await getSessionRuangan();
  if (!ruangan) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ success: false, error: "ID sarpras tidak valid." }, { status: 400 });
  }

  try {
    const result = await turso.execute({
      sql: "DELETE FROM sarpras_rawat_jalan WHERE id = ? AND UPPER(TRIM(ruangan)) = ?",
      args: [id, ruangan],
    });
    if (result.rowsAffected === 0) {
      return NextResponse.json({ success: false, error: "Data sarpras tidak ditemukan di ruangan Anda." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sarpras delete failed:", error);
    return NextResponse.json({ success: false, error: "Gagal menghapus data sarpras." }, { status: 500 });
  }
}
