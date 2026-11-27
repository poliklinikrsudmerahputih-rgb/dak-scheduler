import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { parseSessionValue } from "@/lib/session";
import { validateSarprasKirRecord } from "@/lib/sarpras-kir";

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
    return NextResponse.json({ success: false, error: "ID inventaris tidak valid." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Format data tidak valid." }, { status: 400 });
  }

  const validated = validateSarprasKirRecord(body, { allowLegacyCondition: true });
  if (validated.error) {
    return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
  }

  try {
    const { value } = validated;
    const result = await turso.execute({
      sql: `UPDATE sarpras_kir_inventory
            SET source_file = CASE
                  WHEN source_file = 'KIR JANUARI 2026.xlsx'
                    THEN 'Diedit manual (KIR JANUARI 2026.xlsx)'
                  ELSE source_file
                END,
                kategori = ?, nama_barang = ?, nomor_barang = ?,
                register = ?, merk_model = ?, no_seri_pabrik = ?, ukuran = ?, bahan = ?,
                warna = ?, tahun_pembuatan = ?, keadaan = ?, jumlah_barang = ?,
                kebutuhan_riil = ?, keterangan = ?
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [
        value.kategori,
        value.nama_barang,
        value.nomor_barang,
        value.register,
        value.merk_model,
        value.no_seri_pabrik,
        value.ukuran,
        value.bahan,
        value.warna,
        value.tahun_pembuatan,
        value.keadaan,
        value.jumlah_barang,
        value.kebutuhan_riil,
        value.keterangan,
        id,
        ruangan,
      ],
    });
    if (result.rowsAffected === 0) {
      return NextResponse.json({ success: false, error: "Data inventaris tidak ditemukan di ruangan Anda." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sarpras KIR update failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memperbarui inventaris KIR." }, { status: 500 });
  }
}
