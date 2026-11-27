import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { parseSessionValue } from "@/lib/session";
import { validateSarprasAlatRusak } from "@/lib/sarpras-alat-rusak";

export const dynamic = "force-dynamic";

async function getSession() {
  const sessionCookie = (await cookies()).get("session_dak_pro");
  const session = parseSessionValue(sessionCookie);
  const ruangan = typeof session?.ruangan === "string" ? session.ruangan.trim().toUpperCase() : "";
  if (!ruangan) return null;
  return {
    ruangan,
    nama: String(session?.nama || session?.username || "").trim(),
  };
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request, { params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ success: false, error: "ID laporan tidak valid." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Format data tidak valid." }, { status: 400 });
  }

  const validated = validateSarprasAlatRusak(body);
  if (validated.error) {
    return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
  }

  try {
    const { value } = validated;
    const result = await turso.execute({
      sql: `UPDATE sarpras_alat_rusak
            SET tanggal_pelaporan = ?, poli_ruangan = ?, nama_barang = ?,
                deskripsi_kerusakan = ?, nama_pelapor = ?, petugas_ipsrs = ?,
                tanggal_selesai = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [
        value.tanggal_pelaporan,
        value.poli_ruangan,
        value.nama_barang,
        value.deskripsi_kerusakan,
        value.nama_pelapor,
        value.petugas_ipsrs,
        value.tanggal_selesai || null,
        session.nama,
        id,
        session.ruangan,
      ],
    });
    if (result.rowsAffected === 0) {
      return NextResponse.json({ success: false, error: "Laporan tidak ditemukan di ruangan Anda." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sarpras alat rusak update failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memperbarui laporan alat rusak." }, { status: 500 });
  }
}
