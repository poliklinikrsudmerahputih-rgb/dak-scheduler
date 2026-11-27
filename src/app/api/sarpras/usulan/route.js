import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseSessionValue } from "@/lib/session";
import { validateSarprasRecord } from "@/lib/sarpras";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

const tableName = "sarpras_usulan_publik";

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

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await turso.execute({
      sql: `SELECT id, kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan,
                   permintaan, spesifikasi, tahun, created_at
            FROM ${tableName}
            WHERE UPPER(TRIM(ruangan)) = ? AND status = 'PENDING'
            ORDER BY created_at ASC, id ASC`,
      args: [session.ruangan],
    });
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Sarpras proposals load failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat antrean usulan Sarpras." }, { status: 500 });
  }
}

export async function POST(request) {
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

  const { kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan, permintaan, spesifikasi, tahun } = validated.value;
  try {
    const result = await turso.execute({
      sql: `INSERT INTO ${tableName}
              (ruangan, kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan,
               permintaan, spesifikasi, tahun)
            VALUES ('POLIKLINIK', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan, permintaan, spesifikasi, tahun],
    });
    return NextResponse.json({ success: true, id: Number(result.lastInsertRowid), status: "PENDING" }, { status: 201 });
  } catch (error) {
    console.error("Public Sarpras proposal create failed:", error);
    return NextResponse.json({ success: false, error: "Gagal mengirim usulan Sarpras." }, { status: 500 });
  }
}

export async function PATCH(request) {
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

  const id = parseId(body?.id);
  const action = body?.action;
  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ success: false, error: "Usulan atau tindakan tidak valid." }, { status: 400 });
  }

  let transaction;
  try {
    transaction = await turso.transaction("write");
    const proposalResult = await transaction.execute({
      sql: `SELECT kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan,
                   permintaan, spesifikasi, tahun
            FROM ${tableName}
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ? AND status = 'PENDING'`,
      args: [id, session.ruangan],
    });
    const proposal = proposalResult.rows[0];
    if (!proposal) {
      await transaction.rollback();
      return NextResponse.json({ success: false, error: "Usulan tidak ditemukan atau sudah diproses." }, { status: 404 });
    }

    let sarprasId = null;
    let nomor = null;
    if (action === "approve") {
      const sequence = await transaction.execute({
        sql: `SELECT COALESCE(MAX(nomor), 0) + 1 AS next_number
              FROM sarpras_rawat_jalan
              WHERE UPPER(TRIM(ruangan)) = ? AND UPPER(TRIM(kategori)) = ? AND tahun = ?`,
        args: [session.ruangan, proposal.kategori, proposal.tahun],
      });
      nomor = Number(sequence.rows[0]?.next_number) || 1;
      const inserted = await transaction.execute({
        sql: `INSERT INTO sarpras_rawat_jalan
                (nomor, kategori, nama_barang, klinik, kebutuhan, keadaan, kekurangan,
                 permintaan, spesifikasi, tahun, ruangan, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          nomor,
          proposal.kategori,
          proposal.nama_barang,
          proposal.klinik,
          proposal.kebutuhan,
          proposal.keadaan,
          proposal.kekurangan,
          proposal.permintaan,
          proposal.spesifikasi,
          proposal.tahun,
          session.ruangan,
          session.nama,
        ],
      });
      sarprasId = Number(inserted.lastInsertRowid);
    }

    const status = action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await transaction.execute({
      sql: `UPDATE ${tableName}
            SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, sarpras_id = ?
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ? AND status = 'PENDING'`,
      args: [status, session.nama, sarprasId, id, session.ruangan],
    });
    if (updated.rowsAffected === 0) {
      throw new Error("Usulan sudah diproses oleh pengguna lain.");
    }

    await transaction.commit();
    return NextResponse.json({ success: true, status, sarpras_id: sarprasId, nomor });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Sarpras proposal rollback failed:", rollbackError);
      }
    }
    console.error("Sarpras proposal review failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memproses usulan Sarpras." }, { status: 500 });
  }
}
