import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { parseSessionValue } from "@/lib/session";
import { validateSarprasRecord } from "@/lib/sarpras";

export const dynamic = "force-dynamic";

const tableName = "sarpras_rawat_jalan";

async function getSession() {
  const sessionCookie = (await cookies()).get("session_dak_pro");
  const session = parseSessionValue(sessionCookie);
  const ruangan = typeof session?.ruangan === "string"
    ? session.ruangan.trim().toUpperCase()
    : "";
  if (!ruangan) return null;
  return {
    ruangan,
    nama: String(session?.nama || session?.username || "").trim(),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await turso.execute({
      sql: `SELECT id, nomor, kategori, nama_barang, klinik, kebutuhan, keadaan,
                   kekurangan, permintaan, spesifikasi, tahun, source_sheet, source_row,
                   created_at, updated_at
            FROM ${tableName}
            WHERE UPPER(TRIM(ruangan)) = ?
            ORDER BY tahun DESC, kategori COLLATE NOCASE, nomor ASC,
                     klinik COLLATE NOCASE, nama_barang COLLATE NOCASE, id ASC`,
      args: [session.ruangan],
    });
    return NextResponse.json({ success: true, ruangan: session.ruangan, data: result.rows });
  } catch (error) {
    console.error("Sarpras load failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat data sarpras." }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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

  let transaction;
  try {
    transaction = await turso.transaction("write");
    const sequence = await transaction.execute({
      sql: `SELECT COALESCE(MAX(nomor), 0) + 1 AS next_number
            FROM ${tableName}
            WHERE UPPER(TRIM(ruangan)) = ? AND UPPER(TRIM(kategori)) = ? AND tahun = ?`,
      args: [session.ruangan, validated.value.kategori, validated.value.tahun],
    });
    const nomor = Number(sequence.rows[0]?.next_number) || 1;
    const { kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan, permintaan, spesifikasi, tahun } = validated.value;
    const result = await transaction.execute({
      sql: `INSERT INTO ${tableName}
              (nomor, kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan,
               permintaan, spesifikasi, tahun, ruangan, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nomor,
        kategori,
        nama_barang,
        klinik,
        kebutuhan,
        keadaan,
        kekurangan,
        permintaan,
        spesifikasi,
        tahun,
        session.ruangan,
        session.nama,
      ],
    });
    await transaction.commit();
    return NextResponse.json({ success: true, id: Number(result.lastInsertRowid), nomor }, { status: 201 });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Sarpras create rollback failed:", rollbackError);
      }
    }
    console.error("Sarpras create failed:", error);
    return NextResponse.json({ success: false, error: "Gagal menyimpan data sarpras." }, { status: 500 });
  }
}
