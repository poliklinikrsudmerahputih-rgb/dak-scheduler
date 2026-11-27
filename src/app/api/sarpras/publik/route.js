import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";

const publicRoom = "POLIKLINIK";

export async function GET(request) {
  const view = new URL(request.url).searchParams.get("view");
  if (!["usulan", "inventaris", "rusak"].includes(view)) {
    return NextResponse.json({ success: false, error: "Jenis data Sarpras tidak valid." }, { status: 400 });
  }

  try {
    if (view === "usulan") {
      const result = await turso.execute({
        sql: `SELECT id, nomor, kategori, nama_barang, klinik, kebutuhan, keadaan,
                     kekurangan, permintaan, spesifikasi, tahun
              FROM sarpras_rawat_jalan
              WHERE UPPER(TRIM(ruangan)) = ?
              ORDER BY tahun DESC, kategori COLLATE NOCASE, nomor ASC,
                       klinik COLLATE NOCASE, nama_barang COLLATE NOCASE, id ASC`,
        args: [publicRoom],
      });
      return NextResponse.json({ success: true, ruangan: publicRoom, data: result.rows });
    }

    if (view === "inventaris") {
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
          args: [publicRoom],
        }),
        turso.execute({
          sql: `SELECT id, source_file, source_sheet_index, source_sheet_name, source_row, nama_ruang,
                       kode_ruang, periode_kartu, kategori, nomor_urut, nama_barang,
                       nomor_barang, register, merk_model, no_seri_pabrik, ukuran, bahan,
                       warna, tahun_pembuatan, keadaan, jumlah_barang, kebutuhan_riil, keterangan
                FROM sarpras_kir_inventory
                WHERE UPPER(TRIM(ruangan)) = ?
                ORDER BY source_sheet_index, source_row`,
          args: [publicRoom],
        }),
      ]);
      return NextResponse.json({
        success: true,
        ruangan: publicRoom,
        sheets: sheets.rows,
        data: inventory.rows,
      });
    }

    const [reports, clinics, sheets, inventoryRooms, existingLocations] = await Promise.all([
      turso.execute({
        sql: `SELECT id, nomor, tanggal_pelaporan, poli_ruangan, nama_barang,
                     deskripsi_kerusakan, nama_pelapor, petugas_ipsrs, tanggal_selesai,
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
        args: [publicRoom],
      }),
      turso.execute({
        sql: `SELECT DISTINCT TRIM(klinik) AS lokasi
              FROM sarpras_rawat_jalan
              WHERE UPPER(TRIM(ruangan)) = ? AND TRIM(COALESCE(klinik, '')) <> ''
              ORDER BY lokasi COLLATE NOCASE`,
        args: [publicRoom],
      }),
      turso.execute({
        sql: `SELECT DISTINCT TRIM(CASE WHEN TRIM(COALESCE(nama_ruang, '')) <> '' THEN nama_ruang ELSE source_sheet_name END) AS lokasi
              FROM sarpras_kir_sheets
              WHERE UPPER(TRIM(ruangan)) = ?
                AND TRIM(CASE WHEN TRIM(COALESCE(nama_ruang, '')) <> '' THEN nama_ruang ELSE source_sheet_name END) <> ''
              ORDER BY lokasi COLLATE NOCASE`,
        args: [publicRoom],
      }),
      turso.execute({
        sql: `SELECT DISTINCT TRIM(CASE WHEN TRIM(COALESCE(nama_ruang, '')) <> '' THEN nama_ruang ELSE source_sheet_name END) AS lokasi
              FROM sarpras_kir_inventory
              WHERE UPPER(TRIM(ruangan)) = ?
                AND TRIM(CASE WHEN TRIM(COALESCE(nama_ruang, '')) <> '' THEN nama_ruang ELSE source_sheet_name END) <> ''
              ORDER BY lokasi COLLATE NOCASE`,
        args: [publicRoom],
      }),
      turso.execute({
        sql: `SELECT DISTINCT TRIM(poli_ruangan) AS lokasi
              FROM sarpras_alat_rusak
              WHERE UPPER(TRIM(ruangan)) = ? AND TRIM(COALESCE(poli_ruangan, '')) <> ''`,
        args: [publicRoom],
      }),
    ]);

    const locations = new Map();
    for (const row of [...clinics.rows, ...sheets.rows, ...inventoryRooms.rows, ...existingLocations.rows]) {
      const location = String(row.lokasi ?? "").trim();
      const key = location.toLocaleUpperCase("id-ID");
      if (location && key !== "SEMUA POLI KLINIK" && !locations.has(key)) locations.set(key, location);
    }

    return NextResponse.json({
      success: true,
      ruangan: publicRoom,
      data: reports.rows,
      poli_ruangan_options: [...locations.values()].sort((left, right) => left.localeCompare(right, "id")),
    });
  } catch (error) {
    console.error("Public Sarpras load failed:", error);
    return NextResponse.json({ success: false, error: "Gagal memuat data sarpras publik." }, { status: 500 });
  }
}
