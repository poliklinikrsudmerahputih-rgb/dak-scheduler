import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { parseSessionValue } from "@/lib/session";
import { validateSarprasKirRecord } from "@/lib/sarpras-kir";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";
const tableName = "sarpras_kir_usulan_publik";
const newRoomOption = "__new_room__";
const manualSource = "Input manual";

async function getSessionRoom() {
  const sessionCookie = (await cookies()).get("session_dak_pro");
  const session = parseSessionValue(sessionCookie);
  const room = typeof session?.ruangan === "string" ? session.ruangan.trim().toUpperCase() : "";
  return room ? { room, name: String(session?.nama || session?.username || "").trim() } : null;
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET() {
  const session = await getSessionRoom();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const result = await turso.execute({
      sql: `SELECT id, data_json, created_at FROM ${tableName}
            WHERE UPPER(TRIM(ruangan)) = ? AND status = 'PENDING'
            ORDER BY created_at, id`,
      args: [session.room],
    });
    const data = result.rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      ...JSON.parse(row.data_json),
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("KIR proposals load failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat usulan inventaris KIR." }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Format usulan KIR tidak valid." }, { status: 400 });
  }

  const validated = validateSarprasKirRecord(body);
  if (validated.error) return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
  const sourceIndex = body.source_sheet_index;
  const isNewRoom = sourceIndex === newRoomOption;
  const newRoomName = typeof body.new_room_name === "string" ? body.new_room_name.trim() : "";
  const numericSourceIndex = Number(sourceIndex);
  if (isNewRoom ? !newRoomName || newRoomName.length > 160 : !Number.isSafeInteger(numericSourceIndex) || numericSourceIndex < 1) {
    return NextResponse.json({ success: false, error: "Pilih tab/ruangan KIR yang valid." }, { status: 400 });
  }

  const data = {
    ...validated.value,
    source_sheet_index: isNewRoom ? newRoomOption : numericSourceIndex,
    new_room_name: isNewRoom ? newRoomName : "",
  };
  try {
    if (!isNewRoom) {
      const sheet = await turso.execute({
        sql: `SELECT 1 FROM sarpras_kir_sheets
              WHERE source_sheet_index = ? AND UPPER(TRIM(ruangan)) = 'POLIKLINIK'`,
        args: [numericSourceIndex],
      });
      if (!sheet.rows.length) {
        return NextResponse.json({ success: false, error: "Tab inventaris KIR tidak ditemukan." }, { status: 400 });
      }
    }

    const result = await turso.execute({
      sql: `INSERT INTO ${tableName} (ruangan, data_json) VALUES ('POLIKLINIK', ?)`,
      args: [JSON.stringify(data)],
    });
    return NextResponse.json({ success: true, id: Number(result.lastInsertRowid), status: "PENDING" }, { status: 201 });
  } catch (error) {
    console.error("Public KIR proposal create failed:", error);
    return NextResponse.json({ success: false, error: "Gagal mengirim usulan inventaris KIR." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await getSessionRoom();
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
    const result = await transaction.execute({
      sql: `SELECT data_json FROM ${tableName}
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ? AND status = 'PENDING'`,
      args: [id, session.room],
    });
    const proposal = result.rows[0];
    if (!proposal) {
      await transaction.rollback();
      return NextResponse.json({ success: false, error: "Usulan tidak ditemukan atau sudah diproses." }, { status: 404 });
    }

    let inventoryId = null;
    let nomorUrut = null;
    if (body.action === "approve") {
      const data = JSON.parse(proposal.data_json);
      const validated = validateSarprasKirRecord(data);
      if (validated.error) throw new Error(validated.error);

      const newRoom = data.source_sheet_index === newRoomOption;
      const roomName = String(data.new_room_name || "").trim();
      let sourceSheetIndex = Number(data.source_sheet_index);
      let sheet;

      if (newRoom) {
        if (!roomName || roomName.length > 160) throw new Error("Nama ruangan usulan tidak valid.");
        const duplicate = await transaction.execute({
          sql: `SELECT 1 FROM sarpras_kir_sheets
                WHERE UPPER(TRIM(ruangan)) = ?
                  AND UPPER(TRIM(CASE WHEN TRIM(nama_ruang) = '' THEN source_sheet_name ELSE nama_ruang END)) = ?
                LIMIT 1`,
          args: [session.room, roomName.toUpperCase()],
        });
        if (duplicate.rows.length) {
          throw new Error("Ruangan yang diusulkan sudah terdaftar. Tolak usulan ini dan kirim ulang menggunakan tab yang ada.");
        }
        const sequence = await transaction.execute({
          sql: "SELECT COALESCE(MAX(source_sheet_index), 0) + 1 AS next_index FROM sarpras_kir_sheets WHERE UPPER(TRIM(ruangan)) = ?",
          args: [session.room],
        });
        sourceSheetIndex = Number(sequence.rows[0]?.next_index);
        await transaction.execute({
          sql: `INSERT INTO sarpras_kir_sheets
                  (ruangan, source_file, source_sheet_index, source_sheet_name, sheet_state,
                   nama_ruang, kode_ruang, periode_kartu, record_count, source_rows_json, source_key)
                VALUES (?, ?, ?, ?, 'visible', ?, '', '', 0, '[]', ?)`,
          args: [session.room, manualSource, sourceSheetIndex, roomName, roomName, `kir-public-room-${randomUUID()}`],
        });
        sheet = { source_sheet_name: roomName, nama_ruang: roomName, kode_ruang: "", periode_kartu: "" };
      } else {
        const sheetResult = await transaction.execute({
          sql: `SELECT source_sheet_name, nama_ruang, kode_ruang, periode_kartu
                FROM sarpras_kir_sheets
                WHERE source_sheet_index = ? AND UPPER(TRIM(ruangan)) = ?`,
          args: [sourceSheetIndex, session.room],
        });
        sheet = sheetResult.rows[0];
        if (!sheet) throw new Error("Tab inventaris usulan tidak ditemukan.");
      }

      const rowSequence = await transaction.execute({
        sql: "SELECT COALESCE(MAX(source_row), 0) + 1 AS next_row FROM sarpras_kir_inventory WHERE source_sheet_index = ? AND UPPER(TRIM(ruangan)) = ?",
        args: [sourceSheetIndex, session.room],
      });
      const numberSequence = await transaction.execute({
        sql: `SELECT COALESCE(MAX(CASE
                  WHEN TRIM(nomor_urut) <> '' AND TRIM(nomor_urut) NOT GLOB '*[^0-9.]*'
                   AND TRIM(nomor_urut) GLOB '*[0-9]*' THEN CAST(TRIM(nomor_urut) AS REAL)
                END), 0) + 1 AS next_number
              FROM sarpras_kir_inventory
              WHERE source_sheet_index = ? AND UPPER(TRIM(ruangan)) = ?`,
        args: [sourceSheetIndex, session.room],
      });
      const sourceRow = Number(rowSequence.rows[0]?.next_row);
      const nextNumber = Number(numberSequence.rows[0]?.next_number);
      if (!Number.isSafeInteger(sourceRow) || sourceRow < 1 || !Number.isFinite(nextNumber) || nextNumber < 1) {
        throw new Error("Nomor inventaris berikutnya tidak valid.");
      }
      nomorUrut = String(nextNumber);

      const value = validated.value;
      const inserted = await transaction.execute({
        sql: `INSERT INTO sarpras_kir_inventory
                (ruangan, source_file, source_sheet_index, source_sheet_name, source_row, source_key,
                 nama_ruang, kode_ruang, periode_kartu, kategori, nomor_urut, nama_barang,
                 nomor_barang, register, merk_model, no_seri_pabrik, ukuran, bahan, warna,
                 tahun_pembuatan, keadaan, jumlah_barang, kebutuhan_riil, keterangan)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          session.room, manualSource, sourceSheetIndex, sheet.source_sheet_name, sourceRow,
          `kir-public-${randomUUID()}`, sheet.nama_ruang || sheet.source_sheet_name || "",
          sheet.kode_ruang || "", sheet.periode_kartu || "", value.kategori, nomorUrut,
          value.nama_barang, value.nomor_barang, value.register, value.merk_model,
          value.no_seri_pabrik, value.ukuran, value.bahan, value.warna,
          value.tahun_pembuatan, value.keadaan, value.jumlah_barang, value.kebutuhan_riil,
          value.keterangan,
        ],
      });
      inventoryId = Number(inserted.lastInsertRowid);
    }

    const status = body.action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await transaction.execute({
      sql: `UPDATE ${tableName}
            SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, inventory_id = ?
            WHERE id = ? AND UPPER(TRIM(ruangan)) = ? AND status = 'PENDING'`,
      args: [status, session.name, inventoryId, id, session.room],
    });
    if (!updated.rowsAffected) throw new Error("Usulan sudah diproses oleh pengguna lain.");
    await transaction.commit();
    return NextResponse.json({ success: true, status, inventory_id: inventoryId, nomor_urut: nomorUrut });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("KIR proposal rollback failed:", rollbackError);
      }
    }
    console.error("KIR proposal review failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Gagal memproses usulan inventaris KIR." }, { status: 500 });
  }
}
