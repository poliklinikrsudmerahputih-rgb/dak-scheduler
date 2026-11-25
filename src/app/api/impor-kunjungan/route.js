import readXlsxFile from "read-excel-file/node";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 3000;
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const normalizeDoctorIdentity = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const normalizeClinic = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const headerKey = (value) => normalize(value).replace(/[^A-Z0-9]/g, "");

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

function parseCount(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  const text = String(value ?? "").trim().replace(/\s/g, "");
  const grouped = /^\d{1,3}(?:[.,]\d{3})+$/.test(text)
    ? text.replace(/[.,]/g, "")
    : /^(\d+)[.,]0+$/.exec(text)?.[1];
  const digits = grouped || text;
  if (!/^\d+$/.test(digits)) return null;
  const count = Number(digits);
  return Number.isSafeInteger(count) ? count : null;
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  const match = iso ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : dmy ? { year: Number(dmy[3]), month: Number(dmy[2]), day: Number(dmy[1]) }
    : null;
  if (!match) return null;
  if (match.year < 2000 || match.year > 2100 || match.month < 1 || match.month > 12) return null;
  const date = new Date(Date.UTC(match.year, match.month - 1, match.day));
  if (date.getUTCFullYear() !== match.year || date.getUTCMonth() + 1 !== match.month || date.getUTCDate() !== match.day) return null;
  return match;
}

function dateKey(d) {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function detectMonthlyReport(rows) {
  const periodPattern = /(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\s*(?:S\/?D|SAMPAI|TO)\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/i;
  let period = null;
  for (const row of rows) {
    for (const value of row) {
      const match = String(value ?? "").match(periodPattern);
      if (match) period = { awal: parseDateValue(match[1]), akhir: parseDateValue(match[2]) };
    }
  }

  const doctorHeaderRow = rows.findIndex((row) => row.some((value) => ["DOKTER", "NAMADOKTER"].includes(headerKey(value))));
  if (doctorHeaderRow < 0) return { error: "Kolom DOKTER tidak ditemukan pada laporan." };
  const doctorColumn = rows[doctorHeaderRow].findIndex((value) => ["DOKTER", "NAMADOKTER"].includes(headerKey(value)));
  const sequenceColumn = rows[doctorHeaderRow].findIndex((value) => ["NO", "NOMOR"].includes(headerKey(value)));
  let totalColumn = -1;
  for (let rowIndex = doctorHeaderRow; rowIndex < Math.min(rows.length, doctorHeaderRow + 4); rowIndex += 1) {
    const column = rows[rowIndex].findIndex((value) => ["TOTAL", "JUMLAHKUNJUNGAN", "TOTALKUNJUNGAN", "JUMLAH"].includes(headerKey(value)));
    if (column >= 0) totalColumn = column;
  }
  if (totalColumn < 0) return { error: "Kolom TOTAL/JUMLAH tidak ditemukan pada judul tabel." };
  if (!period?.awal || !period?.akhir) return { error: "Periode laporan tidak ditemukan. Pastikan rentang tanggal laporan ada di file." };
  const { awal, akhir } = period;
  const lastDay = new Date(Date.UTC(awal.year, awal.month, 0)).getUTCDate();
  if (awal.day !== 1 || akhir.day !== lastDay || awal.month !== akhir.month || awal.year !== akhir.year) {
    return { error: "File bulanan harus berisi rekap satu bulan penuh (tanggal 1 sampai hari terakhir pada bulan yang sama)." };
  }

  const rowsData = [];
  for (let index = doctorHeaderRow + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const sequence = Number(row[sequenceColumn >= 0 ? sequenceColumn : 0]);
    const sourceName = String(row[doctorColumn] ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isSafeInteger(sequence) || sequence < 1 || !sourceName) continue;
    rowsData.push({ rowNumber: index + 1, sourceName, jumlah: parseCount(row[totalColumn]) });
  }
  if (!rowsData.length) return { error: "Tidak ada baris dokter yang dapat dibaca pada laporan." };
  return { mode: "bulanan", year: awal.year, month: awal.month, rows: rowsData, columns: { doctor: doctorColumn + 1, total: totalColumn + 1 } };
}

function detectDailyRangeReport(rows, mode) {
  const headerRowIndex = rows.findIndex((row) => {
    const keys = row.map(headerKey);
    const hasDate = keys.some((k) => ["TANGGAL", "TGL", "DATE"].includes(k));
    const hasDoctor = keys.some((k) => ["DOKTER", "NAMADOKTER", "NAMADOKTERUMUM"].includes(k));
    const hasCount = keys.some((k) => ["JUMLAH", "TOTAL", "JUMLAHKUNJUNGAN", "TOTALKUNJUNGAN", "JUMLAHPASIEN"].includes(k));
    return hasDate && hasDoctor && hasCount;
  });
  if (headerRowIndex < 0) {
    return { error: "Kolom TANGGAL, DOKTER, dan JUMLAH/TOTAL tidak ditemukan. Untuk impor harian/rentang, gunakan header kolom tersebut." };
  }
  const header = rows[headerRowIndex].map(headerKey);
  const dateCol = header.findIndex((k) => ["TANGGAL", "TGL", "DATE"].includes(k));
  const doctorCol = header.findIndex((k) => ["DOKTER", "NAMADOKTER", "NAMADOKTERUMUM"].includes(k));
  const clinicCol = header.findIndex((k) => ["KLINIK", "POLI", "POLIKLINIK", "UNIT"].includes(k));
  const countCol = header.findIndex((k) => ["JUMLAH", "TOTAL", "JUMLAHKUNJUNGAN", "TOTALKUNJUNGAN", "JUMLAHPASIEN"].includes(k));

  const rowsData = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rawDate = row[dateCol];
    const sourceName = String(row[doctorCol] ?? "").replace(/\s+/g, " ").trim();
    const clinicName = clinicCol >= 0 ? String(row[clinicCol] ?? "").replace(/\s+/g, " ").trim() : "";
    const rawCount = row[countCol];
    const hasAny = String(rawDate ?? "").trim() || sourceName || clinicName || String(rawCount ?? "").trim();
    if (!hasAny) continue;
    const parsedDate = parseDateValue(rawDate);
    rowsData.push({
      rowNumber: i + 1,
      sourceName,
      clinicName,
      jumlah: parseCount(rawCount),
      tanggal: parsedDate ? dateKey(parsedDate) : "",
      tahun: parsedDate?.year ?? null,
      bulan: parsedDate?.month ?? null,
      hari: parsedDate?.day ?? null,
    });
  }
  if (!rowsData.length) return { error: "Tidak ada baris data yang dapat dibaca pada file." };

  const validDates = rowsData.map((r) => r.tanggal).filter(Boolean).sort();
  if (!validDates.length) return { error: "Tidak ada tanggal valid yang dapat dibaca. Gunakan format tanggal seperti 2026-11-25 atau 25/11/2026." };
  const minDate = validDates[0];
  const maxDate = validDates[validDates.length - 1];
  if (mode === "harian" && minDate !== maxDate) {
    return { error: `Mode Harian hanya menerima satu tanggal. File ini memiliki rentang ${minDate} s/d ${maxDate}. Gunakan mode Rentang.` };
  }

  return {
    mode: mode === "rentang" ? "rentang" : "harian",
    startDate: minDate,
    endDate: maxDate,
    rows: rowsData,
    columns: { date: dateCol + 1, doctor: doctorCol + 1, clinic: clinicCol >= 0 ? clinicCol + 1 : null, total: countCol + 1 }
  };
}

function detectAggregatePeriodReport(rows, mode) {
  const periodPattern = /(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{4})\s*(?:S\/?D|SAMPAI|TO)\s*(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{4})/i;
  let period = null;
  for (const row of rows) {
    for (const value of row) {
      const match = String(value ?? "").match(periodPattern);
      if (match) period = { awal: parseDateValue(match[1]), akhir: parseDateValue(match[2]) };
    }
  }

  const doctorHeaderRow = rows.findIndex((row) => row.some((value) => ["DOKTER", "NAMADOKTER"].includes(headerKey(value))));
  if (doctorHeaderRow < 0) return { error: "Kolom DOKTER tidak ditemukan pada laporan." };
  const doctorColumn = rows[doctorHeaderRow].findIndex((value) => ["DOKTER", "NAMADOKTER"].includes(headerKey(value)));
  const sequenceColumn = rows[doctorHeaderRow].findIndex((value) => ["NO", "NOMOR"].includes(headerKey(value)));
  let totalColumn = -1;
  for (let rowIndex = doctorHeaderRow; rowIndex < Math.min(rows.length, doctorHeaderRow + 4); rowIndex += 1) {
    const column = rows[rowIndex].findIndex((value) => ["TOTAL", "JUMLAHKUNJUNGAN", "TOTALKUNJUNGAN", "JUMLAH"].includes(headerKey(value)));
    if (column >= 0) totalColumn = column;
  }
  if (totalColumn < 0) return { error: "Kolom TOTAL/JUMLAH tidak ditemukan pada judul tabel." };
  if (!period?.awal || !period?.akhir) return { error: "Periode laporan tidak ditemukan. Pastikan rentang tanggal laporan ada di file." };

  const start = dateKey(period.awal);
  const end = dateKey(period.akhir);
  if (start > end) return { error: "Periode laporan tidak valid: tanggal awal melebihi tanggal akhir." };
  if (mode === "harian" && start !== end) {
    return { error: `Mode Harian hanya menerima satu tanggal. File ini memiliki periode ${start} s/d ${end}. Gunakan mode Rentang.` };
  }

  const rowsData = [];
  for (let index = doctorHeaderRow + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const sequence = Number(row[sequenceColumn >= 0 ? sequenceColumn : 0]);
    const sourceName = String(row[doctorColumn] ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isSafeInteger(sequence) || sequence < 1 || !sourceName) continue;
    rowsData.push({ rowNumber: index + 1, sourceName, jumlah: parseCount(row[totalColumn]) });
  }
  if (!rowsData.length) return { error: "Tidak ada baris dokter yang dapat dibaca pada laporan." };
  return {
    mode,
    reportType: "aggregate",
    startDate: start,
    endDate: end,
    rows: rowsData,
    columns: { doctor: doctorColumn + 1, total: totalColumn + 1 }
  };
}

function normalizeXlsxRows(parsed) {
  if (!Array.isArray(parsed)) return parsed;
  if (parsed.length > 0 && parsed[0] && typeof parsed[0] === "object" && !Array.isArray(parsed[0]) && Array.isArray(parsed[0].data)) {
    return parsed[0].data;
  }
  return parsed;
}

async function previewWorkbook(request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const mode = String(formData.get("mode") || "bulanan").toLowerCase();
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Pilih file Excel terlebih dahulu." }, { status: 400 });
  }
  if (!String(file.name || "").toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "Format file harus .xlsx." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Ukuran file harus lebih kecil dari 10 MB." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    console.error("Gagal membaca file Excel kunjungan:", error);
    return NextResponse.json({ error: "File Excel tidak dapat dibaca. Pastikan file .xlsx tidak rusak." }, { status: 400 });
  }

  const rawRows = normalizeXlsxRows(parsed);
  if (!Array.isArray(rawRows)) {
    return NextResponse.json({ error: "File Excel tidak memiliki sheet data yang bisa dibaca." }, { status: 400 });
  }
  if (rawRows.length > MAX_ROWS + 20 || rawRows.some((row) => Array.isArray(row) && row.length > 100)) {
    return NextResponse.json({ error: `File melebihi batas ${MAX_ROWS} baris atau 100 kolom.` }, { status: 400 });
  }
  if (rawRows.length < 2) {
    return NextResponse.json({ error: "Sheet harus memiliki satu baris judul kolom dan data kunjungan." }, { status: 400 });
  }

  let detected;
  if (mode === "bulanan") {
    detected = detectMonthlyReport(rawRows);
  } else {
    const daily = detectDailyRangeReport(rawRows, mode);
    if (!daily.error) {
      detected = daily;
    } else {
      const isMissingDateCol = /Kolom TANGGAL/i.test(daily.error || "");
      if (isMissingDateCol) {
        detected = detectAggregatePeriodReport(rawRows, mode);
      } else {
        detected = daily;
      }
    }
  }
  if (detected.error) return NextResponse.json({ error: detected.error }, { status: 400 });
  return NextResponse.json({ report: detected });
}

async function getDoctorsForRoom(room) {
  const doctorsResult = await turso.execute({
    sql: `SELECT id, nama_dokter, klinik, simbol_praktik, bobot_jaspel, jadwal_hari
          FROM master_dokter
          WHERE ruangan IS NULL OR TRIM(ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?))
          ORDER BY id ASC`,
    args: [room]
  });
  return doctorsResult.rows || [];
}

function buildDoctorMaps(doctors) {
  const byName = new Map();
  const byNameClinic = new Map();
  for (const doctor of doctors) {
    const name = String(doctor.nama_dokter || "").replace(/\s+/g, " ").trim();
    const clinic = String(doctor.klinik || "").replace(/\s+/g, " ").trim();
    const nameKey = normalizeDoctorIdentity(name);
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push({ ...doctor, nama_dokter: name, klinik: clinic });
    byNameClinic.set(`${nameKey}|${normalizeClinic(clinic)}`, { ...doctor, nama_dokter: name, klinik: clinic });
  }
  return { byName, byNameClinic };
}

async function importMonthlyVisits(body, room) {
  const { tahun, bulan, records } = body || {};
  const year = Number(tahun);
  const month = Number(bulan);
  if (!Number.isInteger(year) || year < 2000 || year > 2100
    || !Number.isInteger(month) || month < 1 || month > 12
    || !Array.isArray(records) || records.length === 0 || records.length > MAX_ROWS) {
    return NextResponse.json({ error: `Pilih antara 1 sampai ${MAX_ROWS} baris data.` }, { status: 400 });
  }

  const doctors = await getDoctorsForRoom(room);
  const doctorsByName = new Map();
  for (const doctor of doctors) {
    const key = normalizeDoctorIdentity(doctor.nama_dokter);
    if (!doctorsByName.has(key)) doctorsByName.set(key, String(doctor.nama_dokter || "").replace(/\s+/g, " ").trim());
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
    const canonicalName = doctorsByName.get(normalizeDoctorIdentity(namaDokter));
    if (!canonicalName) {
      return NextResponse.json({ error: `Dokter "${namaDokter}" pada baris ${lineNumber} tidak ditemukan di Master Dokter ruangan Anda.` }, { status: 400 });
    }
    const key = normalizeDoctorIdentity(canonicalName);
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
    mode: "bulanan",
    imported: normalizedRecords.length,
    totalVisits: normalizedRecords.reduce((total, record) => total + record.jumlah, 0),
    tahun: year,
    bulan: month
  });
}

function normalizeSymbol(value) {
  const normalized = String(value || "").trim().replace(/[^A-Za-z0-9]+/g, " ").replace(/\s+/g, " ").toUpperCase();
  const ners = normalized.match(/NERS\s*\d+/);
  if (ners) return ners[0].replace(/\s+/g, " ");
  const clinic = normalized.match(/POLI\s*[A-Z0-9]+/);
  return clinic ? clinic[0].replace(/\s+/g, " ") : normalized;
}

function symbolsMatch(first, second) {
  const firstKey = normalizeSymbol(first);
  const secondKey = normalizeSymbol(second);
  if (!firstKey || !secondKey) return false;
  if (firstKey === secondKey) return true;
  const firstNers = firstKey.match(/^NERS\s*(\d+)$/)?.[1];
  const secondNers = secondKey.match(/^NERS\s*(\d+)$/)?.[1];
  const firstClinic = firstKey.match(/^POLI\s*(.+)$/)?.[1];
  const secondClinic = secondKey.match(/^POLI\s*(.+)$/)?.[1];
  const firstNumber = firstKey.match(/^(\d+)$/)?.[1];
  const secondNumber = secondKey.match(/^(\d+)$/)?.[1];
  return (firstNers && secondNers && firstNers === secondNers)
    || (firstClinic && secondClinic && firstClinic === secondClinic)
    || (firstNumber && secondNumber && firstNumber === secondNumber)
    || (firstNers && secondNumber && firstNers === secondNumber)
    || (secondNers && firstNumber && secondNers === firstNumber);
}

function resolveDoctorAndClinic(record, doctorMaps) {
  const nameKey = normalizeDoctorIdentity(record.nama_dokter);
  const clinicKey = normalizeClinic(record.klinik || "");
  if (clinicKey) {
    const exact = doctorMaps.byNameClinic.get(`${nameKey}|${clinicKey}`);
    if (exact) return { doctor: exact, error: null };
  }
  const candidates = doctorMaps.byName.get(nameKey) || [];
  if (candidates.length === 0) return { doctor: null, error: "Dokter tidak ditemukan di Master Dokter ruangan Anda." };
  if (clinicKey) {
    const byClinic = candidates.filter((c) => normalizeClinic(c.klinik) === clinicKey);
    if (byClinic.length === 1) return { doctor: byClinic[0], error: null };
    if (byClinic.length > 1) return { doctor: null, error: "Klinik cocok dengan lebih dari satu data master dokter. Periksa data master." };
    return { doctor: null, error: "Klinik pada file tidak cocok dengan klinik dokter di Master Dokter." };
  }
  if (candidates.length === 1) return { doctor: candidates[0], error: null };
  return { doctor: null, error: "Dokter memiliki lebih dari satu klinik di Master Dokter. Isi kolom KLINIK pada file." };
}

function enumerateDates(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function importDailyRangeVisits(body, room, mode) {
  let records = Array.isArray(body?.records) ? body.records : [];
  const reportType = String(body?.reportType || "daily_rows");
  const aggregateStart = String(body?.startDate || "");
  const aggregateEnd = String(body?.endDate || "");

  if (reportType === "aggregate") {
    if (!parseDateValue(aggregateStart) || !parseDateValue(aggregateEnd) || aggregateStart > aggregateEnd) {
      return NextResponse.json({ error: "Periode agregat tidak valid." }, { status: 400 });
    }
    const dates = enumerateDates(aggregateStart, aggregateEnd);
    if (dates.length === 0 || dates.length > 62) {
      return NextResponse.json({ error: "Rentang tanggal agregat tidak valid atau terlalu panjang (maks 62 hari)." }, { status: 400 });
    }
    const expanded = [];
    for (const rec of records) {
      const total = Number(rec?.jumlah);
      if (!Number.isInteger(total) || total < 0) {
        expanded.push({ ...rec, tanggal: dates[0] });
        continue;
      }
      const base = Math.floor(total / dates.length);
      let rem = total % dates.length;
      for (const dt of dates) {
        const jumlah = base + (rem > 0 ? 1 : 0);
        if (rem > 0) rem -= 1;
        expanded.push({ ...rec, tanggal: dt, jumlah, _expandedFromAggregate: true });
      }
    }
    records = expanded;
  }

  if (records.length === 0 || records.length > MAX_ROWS) {
    return NextResponse.json({ error: `Pilih antara 1 sampai ${MAX_ROWS} baris data.` }, { status: 400 });
  }

  const doctors = await getDoctorsForRoom(room);
  const doctorMaps = buildDoctorMaps(doctors);

  const normalizedRecords = [];
  const seen = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] || {};
    const lineNumber = Number(record.rowNumber) || index + 1;
    const namaDokter = String(record.nama_dokter || "").trim().replace(/\s+/g, " ");
    const clinicInput = String(record.klinik || "").trim().replace(/\s+/g, " ");
    const jumlah = record.jumlah;
    const tanggal = String(record.tanggal || "").trim();
    const parsedDate = parseDateValue(tanggal);
    if (!namaDokter || !parsedDate || typeof jumlah !== "number" || !Number.isSafeInteger(jumlah) || jumlah < 0) {
      return NextResponse.json({ error: `Data baris ${lineNumber} tidak valid. Periksa tanggal, dokter, dan jumlah.` }, { status: 400 });
    }
    if (mode === "harian") {
      // all records must be same date; validated on client but enforce here too
    }
    const resolved = resolveDoctorAndClinic({ nama_dokter: namaDokter, klinik: clinicInput }, doctorMaps);
    if (resolved.error || !resolved.doctor) {
      return NextResponse.json({ error: `Baris ${lineNumber} (${namaDokter}): ${resolved.error}` }, { status: 400 });
    }
    const canonicalName = String(resolved.doctor.nama_dokter || "").replace(/\s+/g, " ").trim();
    const canonicalClinic = String(resolved.doctor.klinik || "").replace(/\s+/g, " ").trim();
    const dedupeKey = `${parsedDate.year}-${parsedDate.month}-${parsedDate.day}|${normalizeDoctorIdentity(canonicalName)}|${normalizeClinic(canonicalClinic)}`;
    if (seen.has(dedupeKey)) {
      return NextResponse.json({ error: `Baris ${lineNumber}: data ganda untuk dokter ${canonicalName} (${canonicalClinic}) pada tanggal ${dateKey(parsedDate)}.` }, { status: 400 });
    }
    seen.add(dedupeKey);
    normalizedRecords.push({
      nama_dokter: canonicalName,
      klinik: canonicalClinic,
      jumlah,
      tanggal: parsedDate.day,
      bulan: parsedDate.month,
      tahun: parsedDate.year,
      dateKey: dateKey(parsedDate),
      simbol_praktik: String(resolved.doctor.simbol_praktik || "").trim(),
      rowNumber: lineNumber
    });
  }

  if (mode === "harian") {
    const uniqueDates = [...new Set(normalizedRecords.map((r) => r.dateKey))];
    if (uniqueDates.length !== 1) {
      return NextResponse.json({ error: "Mode Harian hanya boleh berisi satu tanggal." }, { status: 400 });
    }
  }

  const affectedDates = [...new Set(normalizedRecords.map((r) => r.dateKey))].sort();
  const minDate = affectedDates[0];
  const maxDate = affectedDates[affectedDates.length - 1];

  // Upsert into jumlah_pasien_poli (global table, no ruangan column) using doctor+klinik+date.
  // Prefetch existing rows for affected dates to avoid per-row selects.
  const existingRowsRes = await turso.execute({
    sql: `SELECT id, nama_dokter, klinik, tanggal, bulan, tahun
          FROM jumlah_pasien_poli
          WHERE (CAST(tahun AS INTEGER) * 10000 + CAST(bulan AS INTEGER) * 100 + CAST(tanggal AS INTEGER)) BETWEEN ? AND ?`,
    args: [
      Number(minDate.replace(/-/g, "")),
      Number(maxDate.replace(/-/g, ""))
    ]
  });
  const existingMap = new Map();
  for (const row of existingRowsRes.rows || []) {
    const key = `${Number(row.tahun)}-${Number(row.bulan)}-${Number(row.tanggal)}|${normalizeDoctorIdentity(row.nama_dokter)}|${normalizeClinic(row.klinik)}`;
    if (!existingMap.has(key)) existingMap.set(key, row.id);
  }

  let inserted = 0;
  let updated = 0;
  const writeQueries = [];
  for (const rec of normalizedRecords) {
    const key = `${rec.tahun}-${rec.bulan}-${rec.tanggal}|${normalizeDoctorIdentity(rec.nama_dokter)}|${normalizeClinic(rec.klinik)}`;
    const existingId = existingMap.get(key);
    if (existingId) {
      writeQueries.push({
        sql: `UPDATE jumlah_pasien_poli SET jumlah = ?, nama_dokter = ?, klinik = ? WHERE id = ?`,
        args: [rec.jumlah, rec.nama_dokter, rec.klinik, existingId]
      });
      updated += 1;
    } else {
      writeQueries.push({
        sql: `INSERT INTO jumlah_pasien_poli (nama_dokter, klinik, jumlah, tanggal, bulan, tahun) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [rec.nama_dokter, rec.klinik, rec.jumlah, rec.tanggal, rec.bulan, rec.tahun]
      });
      inserted += 1;
    }
  }
  for (let i = 0; i < writeQueries.length; i += 100) {
    const chunk = writeQueries.slice(i, i + 100);
    if (chunk.length) await turso.batch(chunk, "write");
  }

  // Sync monthly recap for affected doctor/months so kartu dokter totals stay consistent.
  const affectedMonths = [...new Set(normalizedRecords.map((r) => `${r.tahun}-${r.bulan}`))];
  const monthlySyncQueries = [];
  for (const ym of affectedMonths) {
    const [tahun, bulan] = ym.split("-").map(Number);
    const doctorKeys = [...new Set(normalizedRecords.filter((r) => r.tahun === tahun && r.bulan === bulan).map((r) => normalizeDoctorIdentity(r.nama_dokter)))];
    for (const dokterKey of doctorKeys) {
      const sample = normalizedRecords.find((r) => r.tahun === tahun && r.bulan === bulan && normalizeDoctorIdentity(r.nama_dokter) === dokterKey);
      const sumRes = await turso.execute({
        sql: `SELECT COALESCE(SUM(jumlah), 0) AS total
              FROM jumlah_pasien_poli
              WHERE TRIM(LOWER(nama_dokter)) = TRIM(LOWER(?)) AND tahun = ? AND bulan = ?`,
        args: [sample.nama_dokter, tahun, bulan]
      });
      const total = Number(sumRes.rows[0]?.total || 0);
      monthlySyncQueries.push({
        sql: `DELETE FROM rekap_kunjungan_dokter_bulanan
              WHERE UPPER(TRIM(ruangan)) = UPPER(TRIM(?)) AND tahun = ? AND bulan = ? AND dokter_key = ?`,
        args: [room, tahun, bulan, dokterKey]
      });
      monthlySyncQueries.push({
        sql: `INSERT INTO rekap_kunjungan_dokter_bulanan (ruangan, tahun, bulan, dokter_key, nama_dokter, jumlah)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [room, tahun, bulan, dokterKey, sample.nama_dokter, total]
      });
    }
  }
  for (let i = 0; i < monthlySyncQueries.length; i += 100) {
    const chunk = monthlySyncQueries.slice(i, i + 100);
    if (chunk.length) await turso.batch(chunk, "write");
  }

  // Assistant matching summary for feedback.
  let assistantSummary = { matched: 0, unmatched: 0, details: [] };
  try {
    const min = minDate; const max = maxDate;
    const [minY, minM, minD] = min.split("-").map(Number);
    const [maxY, maxM, maxD] = max.split("-").map(Number);
    const minInt = minY * 10000 + minM * 100 + minD;
    const maxInt = maxY * 10000 + maxM * 100 + maxD;
    const jadwalRes = await turso.execute({
      sql: `SELECT j.sdm_id, j.tanggal, j.bulan, j.tahun, j.simbol, s.nama
            FROM jadwal_dinas j JOIN sdm s ON j.sdm_id = s.id
            WHERE (j.ruangan IS NULL OR TRIM(j.ruangan) = '' OR UPPER(TRIM(ruangan)) = UPPER(TRIM(?)))
              AND (CAST(j.tahun AS INTEGER) * 10000 + CAST(j.bulan AS INTEGER) * 100 + CAST(j.tanggal AS INTEGER)) BETWEEN ? AND ?`,
      args: [room, minInt, maxInt]
    });
    const jadwalRows = jadwalRes.rows || [];
    const details = [];
    for (const rec of normalizedRecords) {
      const dayRows = jadwalRows.filter((j) => Number(j.tahun) === rec.tahun && Number(j.bulan) === rec.bulan && Number(j.tanggal) === rec.tanggal);
      const assistants = dayRows.filter((j) => symbolsMatch(j.simbol, rec.simbol_praktik));
      const presentAssistants = assistants.filter((j) => !['CT','CM','CS','S','I','L','OFF'].includes(normalizeSymbol(j.simbol)));
      if (presentAssistants.length > 0) assistantSummary.matched += 1;
      else assistantSummary.unmatched += 1;
      details.push({
        tanggal: rec.dateKey,
        nama_dokter: rec.nama_dokter,
        klinik: rec.klinik,
        jumlah: rec.jumlah,
        asisten_count: presentAssistants.length,
        asisten: presentAssistants.map((a) => String(a.nama || "").trim()).filter(Boolean)
      });
    }
    assistantSummary.details = details.slice(0, 200);
  } catch (e) {
    console.warn("Gagal menghitung ringkasan asisten:", e);
  }

  return NextResponse.json({
    success: true,
    mode,
    reportType,
    distributedEvenly: reportType === "aggregate" && aggregateStart !== aggregateEnd,
    imported: normalizedRecords.length,
    inserted,
    updated,
    totalVisits: normalizedRecords.reduce((total, record) => total + record.jumlah, 0),
    startDate: minDate,
    endDate: maxDate,
    assistantSummary
  });
}

export async function POST(request) {
  const room = await getSessionRoom();
  if (!room) return NextResponse.json({ error: "Sesi tidak valid. Silakan login kembali." }, { status: 401 });

  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      return await previewWorkbook(request);
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Data impor tidak valid." }, { status: 400 }); }
    const mode = String(body?.mode || "bulanan").toLowerCase();
    if (mode === "harian" || mode === "rentang") {
      return await importDailyRangeVisits(body, room, mode);
    }
    return await importMonthlyVisits(body, room);
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
