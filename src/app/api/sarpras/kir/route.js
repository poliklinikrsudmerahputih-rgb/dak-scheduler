import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";
import { parseSessionValue } from "@/lib/session";
import { randomUUID } from "node:crypto";
import { validateSarprasKirRecord } from "@/lib/sarpras-kir";

export const dynamic = "force-dynamic";
const manualSource = "Input manual";
const newRoomOption = "__new_room__";

async function getSessionRuangan() {
  const sessionCookie = (await cookies()).get("session_dak_pro");
  const session = parseSessionValue(sessionCookie);
  const ruangan = typeof session?.ruangan === "string" ? session.ruangan.trim().toUpperCase() : "";
  return ruangan || null;
}

export async function GET() {
  const ruangan = await getSessionRuangan();
  if (!ruangan) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [sheets, inventory] = await Promise.all([
      turso.execute({
        sql: `SELECT s.source_sheet_index, s.source_sheet_name, s.sheet_state, s.nama_ruang,
                     s.kode_ruang, s.periode_kartu, COUNT(i.id) AS record_count
              FROM sarpras_kir_sheets s
              LEFT JOIN sarpras_kir_inventory i
                ON i.source_sheet_index = s.source_sheet_index
               AND UPPER(TRIM(i.ruangan)) = UPPER(TRIM(s.ruangan))
              WHERE UPPER(TRIM(s.ruangan)) = ?
              GROUP BY s.id
              ORDER BY s.source_sheet_index`,
        args: [ruangan],
      }),
      turso.execute({
        sql: `SELECT id, source_file, source_sheet_index, source_sheet_name, source_row, nama_ruang,
                     kode_ruang, periode_kartu, kategori, nomor_urut, nama_barang,
                     nomor_barang, register, merk_model, no_seri_pabrik, ukuran, bahan,
                     warna, tahun_pembuatan, keadaan, jumlah_barang, kebutuhan_riil, keterangan
              FROM sarpras_kir_inventory
              WHERE UPPER(TRIM(ruangan)) = ?
              ORDER BY source_sheet_index, source_row`,
        args: [ruangan],
      }),
    ]);

    return NextResponse.json({
      success: true,
      ruangan,
      sheets: sheets.rows,
      data: inventory.rows,
    });
  } catch (error) {
    console.error("Sarpras KIR load failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat inventaris KIR." }, { status: 500 });
  }
}

export async function POST(request) {
  const ruangan = await getSessionRuangan();
  if (!ruangan) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Format data tidak valid." }, { status: 400 });
  }

  const validated = validateSarprasKirRecord(body);
  if (validated.error) {
    return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
  }
  const isNewRoom = body.source_sheet_index === newRoomOption;
  const newRoomName = typeof body.new_room_name === "string" ? body.new_room_name.trim() : "";
  if (isNewRoom && (!newRoomName || newRoomName.length > 160)) {
    return NextResponse.json({ success: false, error: "Nama ruangan baru wajib diisi, maksimal 160 karakter." }, { status: 400 });
  }
  let sourceSheetIndex = Number(body.source_sheet_index);
  if (!isNewRoom && (!Number.isSafeInteger(sourceSheetIndex) || sourceSheetIndex < 1)) {
    return NextResponse.json({ success: false, error: "Tab inventaris KIR tidak valid." }, { status: 400 });
  }

  let transaction;
  try {
    transaction = await turso.transaction("write");
    let sheet;
    if (isNewRoom) {
      const duplicateRoom = await transaction.execute({
        sql: `SELECT source_sheet_index
              FROM sarpras_kir_sheets
              WHERE UPPER(TRIM(ruangan)) = ?
                AND UPPER(TRIM(CASE
                  WHEN TRIM(nama_ruang) = '' THEN source_sheet_name
                  ELSE nama_ruang
                END)) = ?
              LIMIT 1`,
        args: [ruangan, newRoomName.toUpperCase()],
      });
      if (duplicateRoom.rows.length > 0) {
        await transaction.rollback();
        return NextResponse.json({ success: false, error: "Ruangan sudah ada. Pilih ruangan tersebut dari dropdown." }, { status: 409 });
      }

      const roomSequence = await transaction.execute({
        sql: `SELECT COALESCE(MAX(source_sheet_index), 0) + 1 AS next_index
              FROM sarpras_kir_sheets
              WHERE UPPER(TRIM(ruangan)) = ?`,
        args: [ruangan],
      });
      sourceSheetIndex = Number(roomSequence.rows[0]?.next_index);
      if (!Number.isSafeInteger(sourceSheetIndex) || sourceSheetIndex < 1) {
        throw new Error("Nomor tab inventaris berikutnya tidak valid.");
      }

      await transaction.execute({
        sql: `INSERT INTO sarpras_kir_sheets
                (ruangan, source_file, source_sheet_index, source_sheet_name, sheet_state,
                 nama_ruang, kode_ruang, periode_kartu, record_count, source_rows_json, source_key)
              VALUES (?, ?, ?, ?, 'visible', ?, '', '', 0, '[]', ?)`,
        args: [
          ruangan,
          manualSource,
          sourceSheetIndex,
          newRoomName,
          newRoomName,
          `kir-manual-room-${randomUUID()}`,
        ],
      });
      sheet = {
        source_sheet_name: newRoomName,
        nama_ruang: newRoomName,
        kode_ruang: "",
        periode_kartu: "",
      };
    } else {
      const sheetResult = await transaction.execute({
        sql: `SELECT source_sheet_name, nama_ruang, kode_ruang, periode_kartu
              FROM sarpras_kir_sheets
              WHERE source_sheet_index = ? AND UPPER(TRIM(ruangan)) = ?`,
        args: [sourceSheetIndex, ruangan],
      });
      sheet = sheetResult.rows[0];
      if (!sheet) {
        await transaction.rollback();
        return NextResponse.json({ success: false, error: "Tab inventaris tidak ditemukan di ruangan Anda." }, { status: 404 });
      }
    }

    const rowSequence = await transaction.execute({
      sql: `SELECT COALESCE(MAX(source_row), 0) + 1 AS next_row
            FROM sarpras_kir_inventory
            WHERE source_sheet_index = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [sourceSheetIndex, ruangan],
    });
    const sourceRow = Number(rowSequence.rows[0]?.next_row);
    if (!Number.isSafeInteger(sourceRow) || sourceRow < 1) {
      throw new Error("Nomor baris inventaris berikutnya tidak valid.");
    }

    const numberSequence = await transaction.execute({
      sql: `SELECT COALESCE(MAX(CASE
                WHEN TRIM(nomor_urut) <> ''
                 AND TRIM(nomor_urut) NOT GLOB '*[^0-9.]*'
                 AND TRIM(nomor_urut) GLOB '*[0-9]*'
                THEN CAST(TRIM(nomor_urut) AS REAL)
              END), 0) + 1 AS next_number
            FROM sarpras_kir_inventory
            WHERE source_sheet_index = ? AND UPPER(TRIM(ruangan)) = ?`,
      args: [sourceSheetIndex, ruangan],
    });
    const nextNumber = Number(numberSequence.rows[0]?.next_number);
    if (!Number.isFinite(nextNumber) || nextNumber < 1) {
      throw new Error("Nomor inventaris berikutnya tidak valid.");
    }
    const nomorUrut = String(nextNumber);

    const { value } = validated;
    const result = await transaction.execute({
      sql: `INSERT INTO sarpras_kir_inventory
              (ruangan, source_file, source_sheet_index, source_sheet_name, source_row, source_key,
               nama_ruang, kode_ruang, periode_kartu, kategori, nomor_urut, nama_barang,
               nomor_barang, register, merk_model, no_seri_pabrik, ukuran, bahan, warna,
               tahun_pembuatan, keadaan, jumlah_barang, kebutuhan_riil, keterangan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ruangan,
        manualSource,
        sourceSheetIndex,
        sheet.source_sheet_name,
        sourceRow,
        `kir-manual-${randomUUID()}`,
        sheet.nama_ruang || sheet.source_sheet_name || "",
        sheet.kode_ruang || "",
        sheet.periode_kartu || "",
        value.kategori,
        nomorUrut,
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
      ],
    });
    await transaction.commit();
    return NextResponse.json({
      success: true,
      id: Number(result.lastInsertRowid),
      source_sheet_index: sourceSheetIndex,
      nomor_urut: nomorUrut,
    }, { status: 201 });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Sarpras KIR create rollback failed:", rollbackError);
      }
    }
    console.error("Sarpras KIR create failed:", error);
    return NextResponse.json({ success: false, error: "Gagal menambahkan inventaris KIR." }, { status: 500 });
  }
}
