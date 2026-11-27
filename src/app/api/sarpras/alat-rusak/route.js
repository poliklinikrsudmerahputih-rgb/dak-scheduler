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

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [reports, clinics, kirSheets, kirInventoryRooms, existingLocations] = await Promise.all([
      turso.execute({
        sql: `SELECT id, nomor, tanggal_pelaporan, poli_ruangan, nama_barang,
                     deskripsi_kerusakan, nama_pelapor, petugas_ipsrs,
                     tanggal_selesai, created_by, updated_by, created_at, updated_at,
                     CASE
                       WHEN tanggal_selesai IS NULL OR TRIM(tanggal_selesai) = '' THEN 'MENUNGGU'
                       ELSE 'SELESAI'
                     END AS status
              FROM sarpras_alat_rusak
              WHERE UPPER(TRIM(ruangan)) = ?
              ORDER BY CASE
                         WHEN tanggal_selesai IS NULL OR TRIM(tanggal_selesai) = '' THEN 0
                         ELSE 1
                       END,
                       tanggal_pelaporan DESC, nomor DESC`,
        args: [session.ruangan],
      }),
      turso.execute({
        sql: `SELECT DISTINCT TRIM(klinik) AS lokasi
              FROM sarpras_rawat_jalan
              WHERE UPPER(TRIM(ruangan)) = ?
                AND TRIM(COALESCE(klinik, '')) <> ''
              ORDER BY lokasi COLLATE NOCASE`,
        args: [session.ruangan],
      }),
      turso.execute({
        sql: `SELECT DISTINCT TRIM(CASE
                  WHEN TRIM(COALESCE(nama_ruang, '')) <> '' THEN nama_ruang
                  ELSE source_sheet_name
                END) AS lokasi
              FROM sarpras_kir_sheets
              WHERE UPPER(TRIM(ruangan)) = ?
                AND TRIM(CASE
                  WHEN TRIM(COALESCE(nama_ruang, '')) <> '' THEN nama_ruang
                  ELSE source_sheet_name
                END) <> ''
              ORDER BY lokasi COLLATE NOCASE`,
        args: [session.ruangan],
      }),
      turso.execute({
        sql: `SELECT DISTINCT TRIM(CASE
                  WHEN TRIM(COALESCE(nama_ruang, '')) <> '' THEN nama_ruang
                  ELSE source_sheet_name
                END) AS lokasi
              FROM sarpras_kir_inventory
              WHERE UPPER(TRIM(ruangan)) = ?
                AND TRIM(CASE
                  WHEN TRIM(COALESCE(nama_ruang, '')) <> '' THEN nama_ruang
                  ELSE source_sheet_name
                END) <> ''
              ORDER BY lokasi COLLATE NOCASE`,
        args: [session.ruangan],
      }),
      turso.execute({
        sql: `SELECT DISTINCT TRIM(poli_ruangan) AS lokasi
              FROM sarpras_alat_rusak
              WHERE UPPER(TRIM(ruangan)) = ?
                AND TRIM(COALESCE(poli_ruangan, '')) <> ''`,
        args: [session.ruangan],
      }),
    ]);

    const locations = new Map();
    const addLocation = (value) => {
      const location = String(value ?? "").trim();
      if (!location || location.toLocaleUpperCase("id-ID") === "SEMUA POLI KLINIK") return;
      const key = location.toLocaleUpperCase("id-ID");
      if (!locations.has(key)) locations.set(key, location);
    };
    for (const row of clinics.rows) addLocation(row.lokasi);
    for (const row of kirSheets.rows) addLocation(row.lokasi);
    for (const row of kirInventoryRooms.rows) addLocation(row.lokasi);
    for (const row of existingLocations.rows) addLocation(row.lokasi);

    return NextResponse.json({
      success: true,
      ruangan: session.ruangan,
      nama_pelapor_default: session.nama,
      data: reports.rows,
      poli_ruangan_options: [...locations.values()].sort((left, right) => left.localeCompare(right, "id")),
    });
  } catch (error) {
    console.error("Sarpras alat rusak load failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat buku alat rusak." }, { status: 500 });
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

  const validated = validateSarprasAlatRusak(body);
  if (validated.error) {
    return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
  }

  let transaction;
  try {
    transaction = await turso.transaction("write");
    const sequence = await transaction.execute({
      sql: `SELECT COALESCE(MAX(nomor), 0) + 1 AS next_number
            FROM sarpras_alat_rusak
            WHERE UPPER(TRIM(ruangan)) = ?`,
      args: [session.ruangan],
    });
    const nomor = Number(sequence.rows[0]?.next_number);
    if (!Number.isSafeInteger(nomor) || nomor < 1) {
      throw new Error("Nomor laporan berikutnya tidak valid.");
    }

    const { value } = validated;
    const result = await transaction.execute({
      sql: `INSERT INTO sarpras_alat_rusak
              (ruangan, nomor, tanggal_pelaporan, poli_ruangan, nama_barang,
               deskripsi_kerusakan, nama_pelapor, petugas_ipsrs, tanggal_selesai,
               created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        session.ruangan,
        nomor,
        value.tanggal_pelaporan,
        value.poli_ruangan,
        value.nama_barang,
        value.deskripsi_kerusakan,
        value.nama_pelapor,
        value.petugas_ipsrs,
        value.tanggal_selesai || null,
        session.nama,
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
        console.error("Sarpras alat rusak create rollback failed:", rollbackError);
      }
    }
    console.error("Sarpras alat rusak create failed:", error);
    return NextResponse.json({ success: false, error: "Gagal menyimpan laporan alat rusak." }, { status: 500 });
  }
}
