import readXlsxFile from "read-excel-file/node";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 3000;
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();

async function getSessionRoom() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session_dak_pro");
  if (!sessionCookie) return null;

  try {
    const room = JSON.parse(sessionCookie.value)?.ruangan;
    return String(room || "").trim();
  } catch {
    return null;
  }
}

async function previewWorkbook(request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Pilih file Excel terlebih dahulu." }, { status: 400 });
  }
  if (!String(file.name || "").toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "Format file harus .xlsx." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Ukuran file harus lebih kecil dari 10 MB." }, { status: 400 });
  }

  let rows;
  try {
    const sheets = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
    rows = sheets[0]?.data;
  } catch (error) {
    console.error("Gagal membaca file Excel kunjungan:", error);
    return NextResponse.json({ error: "File Excel tidak dapat dibaca. Pastikan file .xlsx tidak rusak." }, { status: 400 });
  }

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "File Excel tidak memiliki sheet data yang bisa dibaca." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS + 20 || rows.some((row) => row.length > 100)) {
    return NextResponse.json({ error: `File melebihi batas ${MAX_ROWS} baris atau 100 kolom.` }, { status: 400 });
  }
  if (rows.length < 2) {
    return NextResponse.json({ error: "Sheet harus memiliki satu baris judul kolom dan data kunjungan." }, { status: 400 });
  }

  const serializableRows = rows.map((row) => row.map((value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value ?? ""
  ));
  return NextResponse.json({ rows: serializableRows });
}

async function importMonthlyVisits(request, room) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Data impor tidak valid." }, { status: 400 });
  }

  const { tahun, bulan, records } = body || {};
  const year = Number(tahun);
  const month = Number(bulan);
  if (!Number.isInteger(year) || year < 2000 || year > 2100
    || !Number.isInteger(month) || month < 1 || month > 12
    || !Array.isArray(records) || records.length === 0 || records.length > MAX_ROWS) {
    return NextResponse.json({ error: `Pilih antara 1 sampai ${MAX_ROWS} baris data.` }, { status: 400 });
  }

  const doctorsResult = await turso.execute({
    sql: `SELECT nama_dokter FROM master_dokter
          WHERE ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?))`,
    args: [room]
  });
  const doctors = new Map();
  for (const doctor of doctorsResult.rows) {
    const key = normalize(doctor.nama_dokter);
    if (!doctors.has(key)) doctors.set(key, doctor.nama_dokter);
  }

  const seen = new Set();
  const normalizedRecords = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] || {};
    const namaDokter = String(record.nama_dokter || "").trim().replace(/\s+/g, " ");
    const jumlah = record.jumlah;
    const lineNumber = Number(record.rowNumber) || index + 1;

    if (!namaDokter || typeof jumlah !== "number" || !Number.isSafeInteger(jumlah) || jumlah < 0) {
      return NextResponse.json({ error: `Data baris ${lineNumber} tidak valid. Periksa nama dokter dan jumlah kunjungan.` }, { status: 400 });
    }

    const canonicalName = doctors.get(normalize(namaDokter));
    if (!canonicalName) {
      return NextResponse.json({ error: `Dokter "${namaDokter}" pada baris ${lineNumber} tidak ditemukan di Master Dokter ruangan Anda.` }, { status: 400 });
    }

    const key = normalize(canonicalName);
    if (seen.has(key)) {
      return NextResponse.json({ error: `Ada nama dokter ganda pada baris ${lineNumber} (${canonicalName}). Perbaiki file sebelum impor.` }, { status: 400 });
    }
    seen.add(key);
    normalizedRecords.push({ nama_dokter: canonicalName, dokter_key: key, jumlah });
  }

  const queries = [
    {
      sql: "DELETE FROM rekap_kunjungan_dokter_bulanan WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?)) AND tahun = ? AND bulan = ?",
      args: [room, year, month]
    },
    ...normalizedRecords.map((record) => ({
      sql: `INSERT INTO rekap_kunjungan_dokter_bulanan
              (ruangan, tahun, bulan, dokter_key, nama_dokter, jumlah)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [room, year, month, record.dokter_key, record.nama_dokter, record.jumlah]
    }))
  ];

  await turso.batch(queries, "write");
  return NextResponse.json({
    success: true,
    imported: normalizedRecords.length,
    totalVisits: normalizedRecords.reduce((total, record) => total + record.jumlah, 0),
    tahun: year,
    bulan: month
  });
}

export async function POST(request) {
  const room = await getSessionRoom();
  if (!room) return NextResponse.json({ error: "Sesi tidak valid. Silakan login kembali." }, { status: 401 });

  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      return await previewWorkbook(request);
    }
    return await importMonthlyVisits(request, room);
  } catch (error) {
    console.error("Gagal memproses impor kunjungan:", error);
    return NextResponse.json({ error: "Impor kunjungan gagal diproses. Tidak ada perubahan yang dikonfirmasi." }, { status: 500 });
  }
}

export async function GET(request) {
  const room = await getSessionRoom();
  if (!room) return NextResponse.json({ error: "Sesi tidak valid. Silakan login kembali." }, { status: 401 });

  try {
    const url = new URL(request.url);
    const year = Number(url.searchParams.get("tahun"));
    const month = Number(url.searchParams.get("bulan"));
    const periodsResult = await turso.execute({
      sql: `SELECT tahun, bulan, COUNT(*) AS jumlah_dokter, SUM(jumlah) AS total_kunjungan
            FROM rekap_kunjungan_dokter_bulanan
            WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
            GROUP BY tahun, bulan
            ORDER BY tahun DESC, bulan DESC`,
      args: [room]
    });

    if (!Number.isInteger(year) || year < 2000 || year > 2100
      || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({
        periods: periodsResult.rows,
        records: [],
        totalVisits: 0
      });
    }

    const recordsResult = await turso.execute({
      sql: `SELECT nama_dokter, jumlah
            FROM rekap_kunjungan_dokter_bulanan
            WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
              AND tahun = ? AND bulan = ?
            ORDER BY jumlah DESC, nama_dokter ASC`,
      args: [room, year, month]
    });

    return NextResponse.json({
      periods: periodsResult.rows,
      records: recordsResult.rows,
      totalVisits: recordsResult.rows.reduce((total, record) => total + (Number(record.jumlah) || 0), 0)
    });
  } catch (error) {
    console.error("Gagal memuat laporan kunjungan bulanan:", error);
    return NextResponse.json({ error: "Laporan kunjungan bulanan gagal dimuat." }, { status: 500 });
  }
}
