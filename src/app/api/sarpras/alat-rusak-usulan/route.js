import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseSessionValue } from "@/lib/session";
import { validateSarprasAlatRusak } from "@/lib/sarpras-alat-rusak";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";
const tableName = "sarpras_alat_rusak_usulan_publik";

async function getSession() {
  const cookie = (await cookies()).get("session_dak_pro");
  const session = parseSessionValue(cookie);
  const ruangan = typeof session?.ruangan === "string" ? session.ruangan.trim().toUpperCase() : "";
  return ruangan ? { ruangan, nama: String(session?.nama || session?.username || "").trim() } : null;
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const result = await turso.execute({
      sql: `SELECT id, data_json, created_at FROM ${tableName}
            WHERE UPPER(TRIM(ruangan)) = ? AND status = 'PENDING'
            ORDER BY created_at, id`,
      args: [session.ruangan],
    });
    return NextResponse.json({
      success: true,
      data: result.rows.map((row) => ({ id: row.id, created_at: row.created_at, ...JSON.parse(row.data_json) })),
    });
  } catch (error) {
    console.error("Repair proposals load failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat usulan buku alat rusak." }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Format usulan laporan tidak valid." }, { status: 400 });
  }
  const validated = validateSarprasAlatRusak(body);
  if (validated.error) return NextResponse.json({ success: false, error: validated.error }, { status: 400 });

  try {
    const result = await turso.execute({
      sql: `INSERT INTO ${tableName} (ruangan, data_json) VALUES ('POLIKLINIK', ?)`,
      args: [JSON.stringify(validated.value)],
    });
    return NextResponse.json({ success: true, id: Number(result.lastInsertRowid), status: "PENDING" }, { status: 201 });
  } catch (error) {
    console.error("Public repair proposal create failed:", error);
    return NextResponse.json({ success: false, error: "Gagal mengirim usulan laporan alat rusak." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Format data tidak valid." }, { status: 400 });
  }
  const id = parseId(body?.id);
  if (!id || !["approve", "reject"].includes(body?.action)) {
    return NextResponse.json({ success: false, error: "Usulan atau tindakan tidak valid." }, { status: 400 });
  }

  let transaction;
  try {
    transaction = await turso.transaction("write");
    const proposalResult = await transaction.execute({
      sql: `SELECT data_json FROM ${tableName}
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ? AND status = 'PENDING'`,
      args: [id, session.ruangan],
    });
    const proposal = proposalResult.rows[0];
    if (!proposal) {
      await transaction.rollback();
      return NextResponse.json({ success: false, error: "Usulan tidak ditemukan atau sudah diproses." }, { status: 404 });
    }

    let reportId = null;
    let nomor = null;
    if (body.action === "approve") {
      const validated = validateSarprasAlatRusak(JSON.parse(proposal.data_json));
      if (validated.error) throw new Error(validated.error);
      const sequence = await transaction.execute({
        sql: "SELECT COALESCE(MAX(nomor), 0) + 1 AS next_number FROM sarpras_alat_rusak WHERE UPPER(TRIM(ruangan)) = ?",
        args: [session.ruangan],
      });
      nomor = Number(sequence.rows[0]?.next_number);
      if (!Number.isSafeInteger(nomor) || nomor < 1) throw new Error("Nomor laporan berikutnya tidak valid.");

      const value = validated.value;
      const inserted = await transaction.execute({
        sql: `INSERT INTO sarpras_alat_rusak
                (ruangan, nomor, tanggal_pelaporan, poli_ruangan, nama_barang,
                 deskripsi_kerusakan, nama_pelapor, petugas_ipsrs, tanggal_selesai,
                 created_by, updated_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          session.ruangan, nomor, value.tanggal_pelaporan, value.poli_ruangan,
          value.nama_barang, value.deskripsi_kerusakan, value.nama_pelapor,
          value.petugas_ipsrs, value.tanggal_selesai || null, session.nama, session.nama,
        ],
      });
      reportId = Number(inserted.lastInsertRowid);
    }

    const status = body.action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await transaction.execute({
      sql: `UPDATE ${tableName}
            SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, report_id = ?
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ? AND status = 'PENDING'`,
      args: [status, session.nama, reportId, id, session.ruangan],
    });
    if (!updated.rowsAffected) throw new Error("Usulan sudah diproses oleh pengguna lain.");
    await transaction.commit();
    return NextResponse.json({ success: true, status, report_id: reportId, nomor });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Repair proposal rollback failed:", rollbackError);
      }
    }
    console.error("Repair proposal review failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Gagal memproses usulan buku alat rusak." }, { status: 500 });
  }
}
